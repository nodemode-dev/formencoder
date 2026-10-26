import shutil

import pytest

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg is not installed")


def progress(d):
    rows = d.run("encode.status")["encoding"]
    return (rows[0]["status"], rows[0]["outTime"] or 0.0) if rows else (None, 0.0)


def start_encoding(d, clip, tmp_path):
    oid = d.run("queue.addSource", paths=[str(clip)], format="prores", folder=str(tmp_path / "out"))["output"]
    d.run("queue.start")
    assert d.pump(lambda: progress(d)[1] > 0.2, 120), progress(d)
    return oid


def test_pause_holds_the_encode_and_resume_continues_it(driver, long_clip, tmp_path):
    d = driver()
    oid = start_encoding(d, long_clip, tmp_path)
    d.run("queue.pause")
    d.pump(lambda: False, 0.6)
    held = progress(d)
    assert held[0] == "paused" and d.run("encode.status")["paused"]
    d.pump(lambda: False, 1.5)
    assert progress(d) == held
    d.run("queue.start")
    assert d.pump(lambda: progress(d)[1] > held[1], 60)
    assert d.output(oid)["status"] == "encoding" and not d.run("encode.status")["paused"]


def test_stop_cancels_the_encode_and_the_item_can_be_encoded_again(driver, long_clip, tmp_path):
    d = driver()
    oid = start_encoding(d, long_clip, tmp_path)
    d.run("queue.stop")
    assert d.pump(lambda: d.output(oid)["status"] == "stopped", 30)
    assert d.run("queue.list")["counts"]["stopped"] == 1 and not d.run("queue.list")["running"]
    d.run("queue.resetStatus", refs=[oid])
    assert d.output(oid)["status"] == "ready"


def test_queue_survives_an_engine_restart(driver, clip2, long_clip, tmp_path):
    d = driver()
    done = d.run("queue.addSource", paths=[str(clip2)], format="h264", folder=str(tmp_path / "out"), settings={"video": {"matchSource": False, "width": 256, "height": 144}})["output"]
    d.run("queue.start")
    row = d.finish(done, 180)
    assert row["status"] == "done", row
    waiting = d.run("queue.addSource", paths=[str(long_clip)], format="prores", folder=str(tmp_path / "out"))["output"]
    d.run("queue.save")
    d.close()
    again = driver()
    listing = again.run("queue.list")
    assert [o["id"] for it in listing["items"] for o in it["outputs"]] == [done, waiting]
    assert again.output(done)["status"] == "done" and again.output(done)["path"] == row["path"]
    assert again.output(waiting)["status"] == "ready"


def test_encode_interrupted_by_a_restart_comes_back_ready_and_can_start(driver, long_clip, tmp_path):
    d = driver()
    oid = start_encoding(d, long_clip, tmp_path)
    d.close()
    again = driver()
    assert again.output(oid)["status"] == "ready"
    again.run("queue.start")
    assert again.pump(lambda: progress(again)[1] > 0.2, 120)
    assert again.output(oid)["status"] == "encoding"
