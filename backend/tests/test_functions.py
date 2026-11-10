import json
import os
import re
import shutil
import subprocess
import sys

import pytest

from conftest import BACKEND, REPO, ffprobe, make_clip

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None, reason="ffmpeg and ffprobe are not installed")


@pytest.fixture(scope="module")
def clip(tmp_path_factory):
    return make_clip(tmp_path_factory.mktemp("fn") / "tone and bars.mp4", seconds=2)


def streams(path, kind):
    return [s for s in ffprobe(path)["streams"] if s["codec_type"] == kind]


def test_manifest_is_the_engine_catalogue_and_names_an_importable_entry():
    from app import __version__
    from app.functions import manifest

    on_disk = json.loads((REPO / "form-functions.json").read_text(encoding="utf-8"))
    assert manifest.render(on_disk) == manifest.render(manifest.build()), "run python -m app.functions manifest --write"
    assert (on_disk["format"], on_disk["format_version"], on_disk["app"], on_disk["app_version"]) == ("form-functions", 1, "formencoder", __version__)
    fn = on_disk["functions"][0]
    module, _, name = fn["entry"].partition(":")
    assert callable(getattr(__import__(module, fromlist=[name]), name))
    presets = fn["params"]["properties"]["preset"]["enum"]
    assert {"system/webm-vp9-1080p", "system/aac-256", "system/match-source-medium"} <= set(presets)
    assert not any(p.startswith("ingest/") or "sequence" in p or "dcp" in p for p in presets)
    assert set(fn["outputs"][0]["by_param"]["preset"]) == set(presets)


def test_video_preset_with_a_settings_patch_writes_one_verified_file_in_out_dir(clip, tmp_path):
    from app.functions import encode

    out = tmp_path / "out"
    result = encode({"media": str(clip)}, {"preset": "system/webm-vp9-1080p", "settings": {"video": {"matchSource": False, "width": 320, "height": 180}}}, str(out))
    path = result["media"]
    assert os.path.dirname(path) == str(out.resolve()) and path.endswith(".webm")
    video = streams(path, "video")
    assert video[0]["codec_name"] == "vp9" and (video[0]["width"], video[0]["height"]) == (320, 180)
    assert float(ffprobe(path)["format"]["duration"]) == pytest.approx(2.0, abs=0.15)


def test_audio_only_preset_writes_audio_without_video(clip, tmp_path):
    from app.functions import encode

    path = encode({"media": str(clip)}, {"preset": "system/aac-256"}, str(tmp_path))["media"]
    assert path.endswith(".m4a")
    assert streams(path, "video") == [] and streams(path, "audio")[0]["codec_name"] == "aac"


@pytest.mark.parametrize("params,needle", [
    ({}, "params.preset is required"),
    ({"preset": "system/no-such-preset"}, "not one of"),
    ({"preset": "system/png-sequence"}, "not one of"),
    ({"preset": "system/aac-256", "speed": 2}, "params has speed, which a function cannot set"),
    ({"preset": "system/aac-256", "settings": "fast"}, "params.settings must be an object"),
])
def test_bad_params_fail_with_a_clear_message(clip, tmp_path, params, needle):
    from app.functions import ParamsError, encode

    with pytest.raises(ParamsError, match=needle):
        encode({"media": str(clip)}, params, str(tmp_path))


def test_missing_or_unreadable_inputs_fail_with_a_clear_message(tmp_path):
    from app.functions import FunctionError, encode

    text = tmp_path / "notes.txt"
    text.write_text("not media", encoding="utf-8")
    for inputs, needle in [({}, "inputs.media is required"), ({"media": str(tmp_path / "gone.mp4")}, "no file at"),
                           ({"media": [str(text)]}, "one file path"), ({"media": str(text)}, "not video or audio")]:
        with pytest.raises(FunctionError, match=needle):
            encode(inputs, {"preset": "system/aac-256"}, str(tmp_path / "out"))


UNSAFE = [
    ({"effects": {"lut": {"enabled": True, "path": "/etc/passwd"}}}, "params.settings.effects has lut"),
    ({"captions": {"mode": "burn", "source": "/etc/hosts"}}, "params.settings has captions"),
    ({"effects": {"loudness": {"enabled": True, "reportFolder": "/tmp/elsewhere"}}}, "params.settings.effects.loudness has reportFolder"),
    ({"effects": {"imageOverlay": {"enabled": True, "path": "/etc/passwd"}}}, "params.settings.effects has imageOverlay"),
    ({"outputName": "../escaped"}, "params.settings has outputName"),
    ({"publish": [{"type": "folder", "path": "/tmp"}]}, "params.settings has publish"),
    ({"format": "png"}, "params.settings has format"),
    ({"video": {"width": "wide"}}, "params.settings.video.width must be an integer or null"),
]


@pytest.mark.parametrize("settings,needle", UNSAFE)
def test_settings_outside_the_allowlist_are_refused_not_dropped(clip, tmp_path, settings, needle):
    from app.functions import ParamsError, encode

    with pytest.raises(ParamsError, match=re.escape(needle)):
        encode({"media": str(clip)}, {"preset": "system/aac-256", "settings": settings}, str(tmp_path / "out"))
    assert not (tmp_path / "out").exists() or not list((tmp_path / "out").iterdir())
    assert not list(tmp_path.glob("escaped*"))


@pytest.mark.parametrize("settings,needle", UNSAFE[:3])
def test_the_engine_side_guard_refuses_paths_even_past_the_allowlist(clip, tmp_path, settings, needle):
    from app.functions import FunctionError, catalogue, guard
    from app.functions.session import headless

    out = tmp_path / "out"
    with headless() as s:
        oid = s.run("queue.addSource", paths=[str(clip)], preset="system/aac-256", folder=str(out), settings=settings)["output"]
        with pytest.raises(FunctionError, match="outside"):
            guard.before(s, oid, out.resolve(), catalogue.planned(s, oid)["path"])
    with pytest.raises(FunctionError, match="outside out_dir"):
        guard.after({"path": str(out / "a.m4a"), "loudnessReport": "/tmp/elsewhere/a_loudness.xml"}, out.resolve())


def test_an_allowed_bitrate_patch_still_encodes(clip, tmp_path):
    from app.functions import encode

    path = encode({"media": str(clip)}, {"preset": "system/aac-256", "settings": {"audio": {"bitrate": 96}}}, str(tmp_path))["media"]
    assert int(streams(path, "audio")[0]["bit_rate"]) < 160_000


def test_the_persons_data_folder_is_never_used(clip, tmp_path):
    from app.functions import encode

    before = os.environ["FORMENCODER_DATA_DIR"]
    encode({"media": str(clip)}, {"preset": "system/wav-48-16"}, str(tmp_path))
    assert os.environ["FORMENCODER_DATA_DIR"] == before
    assert not (tmp_path / "queue.json").exists()


def cli(*args):
    return subprocess.run([sys.executable, "-m", "app.functions", *args], cwd=BACKEND, capture_output=True, text=True, timeout=300)


def test_cli_prints_the_result_as_one_json_line_and_errors_as_json(clip, tmp_path):
    ok = cli("run", "encode", "--inputs", json.dumps({"media": str(clip)}), "--params", json.dumps({"preset": "system/aac-256"}), "--out", str(tmp_path))
    assert ok.returncode == 0, ok.stderr
    assert json.loads(ok.stdout.strip().splitlines()[-1])["media"].endswith(".m4a")
    bad = cli("run", "encode", "--inputs", json.dumps({"media": str(clip)}), "--params", "{}", "--out", str(tmp_path))
    assert bad.returncode == 1 and json.loads(bad.stdout)["error"] == "params.preset is required"
