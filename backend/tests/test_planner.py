import shutil

import pytest

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg is not installed")


def plan_all(d, clip, folder, repeats):
    oid = d.run("queue.addSource", paths=[str(clip)], folder=str(folder))["output"]
    plans = {}
    for preset in d.run("preset.list", kind="encode")["presets"]:
        d.run("queue.setPreset", refs=[oid], preset=preset["id"])
        plans[preset["id"]] = [d.run("encode.command", output=oid)["command"].replace(oid, "OUTPUT").replace(str(d.data), "DATA") for _ in range(repeats)]
    return plans


def test_every_shipped_preset_plans_the_same_arguments_every_time(driver, clip2, tmp_path):
    first = plan_all(driver("a"), clip2, tmp_path / "out", 2)
    second = plan_all(driver("b"), clip2, tmp_path / "out", 1)
    assert len(first) >= 90
    unstable = [pid for pid, runs in first.items() if len(set(runs)) != 1 or runs[0] != second[pid][0]]
    assert not unstable, unstable
    assert all("ffmpeg" in runs[0].split(" ", 1)[0] and f"-i {clip2}" in runs[0] for runs in first.values())
