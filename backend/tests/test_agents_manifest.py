import json
import subprocess
import sys

from conftest import REPO, tool_catalogue

MANIFEST = REPO / "agents" / "manifest.json"


def test_the_committed_manifest_is_current():
    done = subprocess.run([sys.executable, "-I", str(REPO / "setup" / "agents.py"), "sync", "--check"], capture_output=True, text=True, timeout=180)
    assert done.returncode == 0, done.stdout + done.stderr
    assert "agents/manifest.json" not in done.stdout


def test_the_manifest_lists_the_tools_the_server_lists():
    doc = json.loads(MANIFEST.read_text(encoding="utf-8"))
    mcp = doc["mcp"]
    assert doc["app"] == "formencoder"
    assert mcp["tools"] == [t["name"] for t in tool_catalogue()]
    assert set(mcp["read_only"]) <= set(mcp["tools"])
    assert set(mcp["approval_gated"]) == set(mcp["tools"]) - set(mcp["read_only"])
    assert mcp["transports"] == ["stdio", "http"]
