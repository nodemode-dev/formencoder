import re
import shutil
import subprocess

import pytest

from conftest import ffmpeg_has, ffprobe

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None, reason="ffmpeg and ffprobe are not installed")

CASES = [
    ("h264", "h264", ["libx264"], "mp4"),
    ("prores", "prores", ["prores_ks", "prores_aw", "prores"], "mov"),
    ("av1", "av1", ["libsvtav1", "libaom-av1", "librav1e"], "mp4"),
]


def lufs(path):
    out = subprocess.run(["ffmpeg", "-nostats", "-i", str(path), "-af", "ebur128=framelog=quiet", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", out)[-1])


@pytest.mark.parametrize("fmt,codec,encoders,ext", CASES)
def test_two_second_clip_encodes_to_the_codec_size_and_duration_asked(driver, clip2, tmp_path, fmt, codec, encoders, ext):
    if not any(ffmpeg_has(e) for e in encoders):
        pytest.skip(f"this ffmpeg build has none of {', '.join(encoders)}")
    d = driver()
    added = d.run("queue.addSource", paths=[str(clip2)], format=fmt, folder=str(tmp_path / "out"), settings={"video": {"matchSource": False, "width": 256, "height": 144}})
    oid = added["output"]
    d.run("queue.start")
    row = d.finish(oid, 180)
    assert row["status"] == "done", row
    info = ffprobe(row["path"])
    video = next(s for s in info["streams"] if s["codec_type"] == "video")
    assert video["codec_name"] == codec
    assert (video["width"], video["height"]) == (256, 144)
    assert float(info["format"]["duration"]) == pytest.approx(2.0, abs=0.15)
    assert row["path"].endswith("." + ext)
    verdict = d.run("encode.verify", output=oid)
    assert verdict["passed"], verdict["checks"]


@pytest.mark.parametrize("standard,target,gain", [("ebu-r128", -23.0, 0.2), ("ebu-r128", -23.0, 2.0), ("atsc-a85", -24.0, 0.2)])
def test_loudness_normalisation_reaches_its_target(driver, tmp_path, standard, target, gain):
    src = tmp_path / "tone.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"sine=f=300:sample_rate=48000:duration=6,volume={gain}", "-f", "lavfi", "-i", "anoisesrc=d=6:a=0.05:r=48000:seed=7",
                    "-filter_complex", "amix=inputs=2:duration=first:normalize=0", "-c:a", "pcm_f32le", str(src)], check=True)
    assert abs(lufs(src) - target) > 2
    d = driver()
    oid = d.run("queue.addSource", paths=[str(src)], format="wav", folder=str(tmp_path / "out"), settings={"effects": {"loudness": {"enabled": True, "standard": standard}}})["output"]
    d.run("queue.start")
    row = d.finish(oid, 180)
    assert row["status"] == "done", row
    assert abs(lufs(row["path"]) - target) <= 0.5
    assert row["loudness"]["target"] == target
