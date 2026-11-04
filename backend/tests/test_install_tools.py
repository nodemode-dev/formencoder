import importlib.util

import pytest

from conftest import REPO


@pytest.fixture
def install_tools():
    spec = importlib.util.spec_from_file_location("install_tools", REPO / "setup" / "install_tools.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_every_cmake_configure_sets_the_policy_minimum_for_cmake_4(install_tools, monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(install_tools, "run", lambda cmd, cwd=None: calls.append(cmd))
    names = [n for n, spec in install_tools.TOOLS.items() if "cmake" in spec]
    assert {"bmx", "asdcplib", "openjpeg"} <= set(names), names
    for name in names:
        (tmp_path / name).mkdir()
        install_tools.build(name, install_tools.TOOLS[name], tmp_path / name)
    configures = [c for c in calls if c[:2] == ["cmake", "-S"]]
    assert len(configures) == len(names), calls
    for cmd in configures:
        assert "-DCMAKE_POLICY_VERSION_MINIMUM=3.5" in cmd, cmd
