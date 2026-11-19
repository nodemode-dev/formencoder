import hashlib
import http.server
import io
import tarfile
import threading

import pytest

GOOD = b"#!/bin/sh\necho pinned\n"


def archive(content):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as t:
        info = tarfile.TarInfo("build/ffmpeg")
        info.size = len(content)
        t.addfile(info, io.BytesIO(content))
    return buf.getvalue()


@pytest.fixture
def served(tmp_path, monkeypatch):
    from app import ffmpeg_fetch

    routes, hits = {}, []

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            hits.append(self.path.split("/")[1])
            body = routes.get(self.path)
            self.send_response(200 if body is not None else 404)
            self.end_headers()
            if body is not None:
                self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    triple = ffmpeg_fetch.host_triple()
    record = {"release": "7.1.5-2", "targets": {triple: {"files": [{"path": "ffmpeg", "sha256": hashlib.sha256(GOOD).hexdigest()}]}}}
    monkeypatch.setattr(ffmpeg_fetch, "record", lambda: record)
    monkeypatch.setattr(ffmpeg_fetch, "SOURCES", (base + "/formai", base + "/formcut"))
    monkeypatch.setattr(ffmpeg_fetch, "user_folder", lambda: tmp_path / "ffmpeg")
    monkeypatch.delenv("FORMENCODER_FFMPEG_RELEASE", raising=False)
    name = f"/ffmpeg-7.1.5-2/ffmpeg-lgpl-7.1.5-2-{triple}.tar.gz"
    yield {"routes": routes, "hits": hits, "base": base, "name": name, "folder": tmp_path / "ffmpeg"}
    server.shutdown()


def test_the_new_address_comes_first_and_the_old_one_second(monkeypatch):
    from app import ffmpeg_fetch

    monkeypatch.delenv("FORMENCODER_FFMPEG_RELEASE", raising=False)
    urls = ffmpeg_fetch.sources({"release": "7.1.5-2"}, "x86_64-unknown-linux-gnu")
    assert urls == [
        "https://github.com/nodemode-dev/formai-binaries/releases/download/ffmpeg-7.1.5-2/ffmpeg-lgpl-7.1.5-2-x86_64-unknown-linux-gnu.tar.gz",
        "https://github.com/nodemode-dev/formcut-binaries/releases/download/ffmpeg-7.1.5-2/ffmpeg-lgpl-7.1.5-2-x86_64-unknown-linux-gnu.tar.gz",
    ]


def test_the_override_is_the_only_address(monkeypatch):
    from app import ffmpeg_fetch

    monkeypatch.setenv("FORMENCODER_FFMPEG_RELEASE", "https://mirror.example/ffmpeg-7.1.5-2/")
    assert ffmpeg_fetch.sources({"release": "7.1.5-2"}, "t") == ["https://mirror.example/ffmpeg-7.1.5-2/ffmpeg-lgpl-7.1.5-2-t.tar.gz"]


def test_wrong_bytes_from_the_first_address_fall_back_to_the_second(served):
    from app import ffmpeg_fetch

    served["routes"]["/formai" + served["name"]] = archive(b"other bytes\n")
    served["routes"]["/formcut" + served["name"]] = archive(GOOD)
    out = ffmpeg_fetch.fetch(lambda p, m: None)
    assert served["hits"] == ["formai", "formcut"] and "/formcut/" in out["source"]
    assert (served["folder"] / "ffmpeg").read_bytes() == GOOD


def test_a_missing_first_address_falls_back_to_the_second(served):
    from app import ffmpeg_fetch

    served["routes"]["/formcut" + served["name"]] = archive(GOOD)
    assert "/formcut/" in ffmpeg_fetch.fetch(lambda p, m: None)["source"]


def test_nothing_is_installed_when_no_address_matches(served):
    from app import ffmpeg_fetch

    served["routes"]["/formai" + served["name"]] = archive(b"x\n")
    served["routes"]["/formcut" + served["name"]] = archive(b"y\n")
    with pytest.raises(ValueError) as caught:
        ffmpeg_fetch.fetch(lambda p, m: None)
    assert (served["base"] + "/formai") in str(caught.value) and (served["base"] + "/formcut") in str(caught.value)
    assert not (served["folder"] / "ffmpeg").exists()


def test_with_the_override_set_the_built_in_addresses_are_not_tried(served, monkeypatch):
    from app import ffmpeg_fetch

    served["routes"]["/formcut" + served["name"]] = archive(GOOD)
    monkeypatch.setenv("FORMENCODER_FFMPEG_RELEASE", served["base"] + "/mirror/ffmpeg-7.1.5-2")
    with pytest.raises(ValueError):
        ffmpeg_fetch.fetch(lambda p, m: None)
    assert served["hits"] == ["mirror"]
