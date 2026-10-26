import pytest

SRT = """1
00:00:01,000 --> 00:00:02,500
Hello there

2
00:00:03,250 --> 00:00:04,125
Second cue
on two lines

3
01:02:03,456 --> 01:02:05,007
Past the hour
"""

CUES = [(1.0, 2.5, "Hello there"), (3.25, 4.125, "Second cue\non two lines"), (3723.456, 3725.007, "Past the hour")]


def rows(result):
    return [(c["start"], c["end"], c["text"]) for c in result["cues"]]


@pytest.fixture
def d(driver):
    return driver()


def test_srt_cues_are_read_with_their_times(d, tmp_path):
    src = tmp_path / "in.srt"
    src.write_text(SRT, encoding="utf-8")
    assert rows(d.run("captions.read", path=str(src))) == CUES


@pytest.mark.parametrize("target", ["vtt", "srt"])
def test_conversion_keeps_every_cue_time(d, tmp_path, target):
    src = tmp_path / "in.srt"
    src.write_text(SRT, encoding="utf-8")
    out = tmp_path / f"out.{target}"
    d.run("captions.convert", path=str(src), to=target, output=str(out))
    assert rows(d.run("captions.read", path=str(out))) == CUES


def test_vtt_round_trip_through_srt_is_stable(d, tmp_path):
    src = tmp_path / "in.srt"
    src.write_text(SRT, encoding="utf-8")
    vtt, back = tmp_path / "a.vtt", tmp_path / "b.srt"
    d.run("captions.convert", path=str(src), to="vtt", output=str(vtt))
    d.run("captions.convert", path=str(vtt), to="srt", output=str(back))
    assert back.read_text(encoding="utf-8") == SRT
    assert vtt.read_text(encoding="utf-8").startswith("WEBVTT\n")
    assert "00:00:03.250 --> 00:00:04.125" in vtt.read_text(encoding="utf-8")


def test_sidecar_beside_an_encode_is_shifted_to_the_output_range(d, tmp_path):
    from conftest import make_clip

    clip = make_clip(tmp_path / "talk.mp4", seconds=6, audio=False)
    (tmp_path / "talk.srt").write_text(SRT.split("3\n01:02")[0] + "\n3\n00:00:05,000 --> 00:00:05,900\nLate cue\n", encoding="utf-8")
    added = d.run("queue.addSource", paths=[str(clip)], format="h264", folder=str(tmp_path / "out"),
                  settings={"video": {"width": 320, "height": 180}, "captions": {"mode": "sidecar", "format": "srt", "source": "auto"}})
    oid = added["outputs"][0] if "outputs" in added else added["output"]
    d.run("queue.setRange", refs=[oid], mode="custom", **{"in": 2.0, "out": 5.5})
    d.run("queue.start")
    row = d.finish(oid)
    assert row["status"] == "done", row
    side = [p for p in row["sidecars"] if str(p).endswith(".srt")]
    assert side, row["sidecars"]
    got = rows(d.run("captions.read", path=side[0]))
    assert got == [(0.0, 0.5, "Hello there"), (1.25, 2.125, "Second cue\non two lines"), (3.0, 3.5, "Late cue")]
