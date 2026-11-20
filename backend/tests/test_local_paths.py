import json
import shutil
import socket
import threading

import pytest

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg is not installed")

ADDRESSES = [
    "tcp://127.0.0.1:{port}/out.mkv",
    "udp://127.0.0.1:{port}/out.mkv",
    "http://127.0.0.1:{port}/out.mp4",
    "rtmp://127.0.0.1:{port}/live/out",
    "ftp://127.0.0.1:{port}/out.mp4",
    "pipe:1",
    "file:{tmp}/via-file-scheme.mp4",
]


class Listener:
    def __init__(self):
        self.sock = socket.socket()
        self.sock.bind(("127.0.0.1", 0))
        self.sock.listen(8)
        self.sock.settimeout(0.1)
        self.port = self.sock.getsockname()[1]
        self.connections = 0
        self.stop = threading.Event()
        self.thread = threading.Thread(target=self.loop, daemon=True)
        self.thread.start()

    def loop(self):
        while not self.stop.is_set():
            try:
                conn, _ = self.sock.accept()
            except OSError:
                continue
            self.connections += 1
            conn.close()

    def close(self):
        self.stop.set()
        self.thread.join(2)
        self.sock.close()


@pytest.fixture
def listener():
    held = Listener()
    yield held
    held.close()


def add(d, clip, **output):
    return d.run("queue.addSource", paths=[str(clip)], outputs=[{"preset": "system/match-source-high", **output}])["output"]


@pytest.mark.parametrize("template", ADDRESSES)
def test_an_output_that_is_an_address_is_refused_when_it_is_set(driver, clip2, tmp_path, listener, template):
    d = driver()
    path = template.format(port=listener.port, tmp=tmp_path)
    message = d.refuses("queue.addSource", paths=[str(clip2)], outputs=[{"preset": "system/match-source-high", "path": path}])
    assert "not a file path on this computer" in message
    assert listener.connections == 0
    assert d.run("queue.list")["items"] == []


def test_an_output_folder_that_is_an_address_is_refused_and_no_folder_is_made(driver, clip2, tmp_path, listener, monkeypatch):
    monkeypatch.chdir(tmp_path)
    d = driver()
    assert "not a file path on this computer" in d.refuses("queue.addSource", paths=[str(clip2)], preset="system/match-source-high", folder=f"http://127.0.0.1:{listener.port}/dir")
    oid = add(d, clip2, folder=str(tmp_path / "out"))
    assert "not a file path on this computer" in d.refuses("queue.setOutput", refs=[oid], folder=f"tcp://127.0.0.1:{listener.port}/dir")
    assert "not a file path on this computer" in d.refuses("queue.setOutput", refs=[oid], path="pipe:1")
    assert listener.connections == 0
    assert sorted(p.name for p in tmp_path.iterdir() if p.name != "data") == []


def test_a_stored_output_folder_that_is_an_address_fails_the_job_and_connects_nowhere(driver, clip2, tmp_path, listener, monkeypatch):
    monkeypatch.chdir(tmp_path)
    d = driver()
    d.run("prefs.set", values={"outputFolder": f"tcp://127.0.0.1:{listener.port}/dir"})
    oid = d.run("queue.addSource", paths=[str(clip2)], preset="system/match-source-high")["output"]
    d.run("queue.start")
    row = d.finish(oid)
    assert row["status"] == "failed"
    assert "not a file path on this computer" in row["error"]
    assert listener.connections == 0
    assert not (tmp_path / "tcp:").exists()


def test_plain_paths_still_encode_and_are_written_at_an_absolute_path(driver, clip2, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    d = driver()
    wanted = {
        "absolute": (str(tmp_path / "plain.mp4"), tmp_path / "plain.mp4"),
        "relative": ("rel/out.mp4", tmp_path / "rel" / "out.mp4"),
        "dash": ("-an.mp4", tmp_path / "-an.mp4"),
    }
    ids = {name: add(d, clip2, path=given) for name, (given, _) in wanted.items()}
    d.run("queue.start")
    for name, (_, expect) in wanted.items():
        row = d.finish(ids[name])
        assert row["status"] == "done", (name, row)
        assert row["path"] == str(expect)
        assert expect.is_file()


def test_an_input_that_is_an_address_is_refused_and_nothing_is_fetched(driver, tmp_path, listener):
    import fe_core

    d = driver()
    for pattern in ("http://127.0.0.1:{port}/x.mp4", "http://127.0.0.1:{port}/f_%06d.png", "tcp://127.0.0.1:{port}/f_%06d.png"):
        given = pattern.format(port=listener.port)
        assert "not a file on this computer" in d.refuses("queue.addSource", paths=[given], preset="system/match-source-high")
        info = json.loads(fe_core.probe(given))
        assert "not a file on this computer" in info["error"]
    assert listener.connections == 0
