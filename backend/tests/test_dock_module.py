import hashlib
import importlib.util
import json
import re
import shutil

from conftest import REPO

LOOKUP = "backend/app/services/agent_lookup.py"
DOCK = REPO / "frontend" / "src" / "dock"
FRONTEND = REPO / "frontend"


def agents():
    spec = importlib.util.spec_from_file_location("formencoder_agents_sync", REPO / "setup" / "agents.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_dock_folder_matches_its_manifest():
    assert agents().dock_problems() == []


def test_a_changed_missing_or_extra_dock_file_is_named(tmp_path):
    copy = tmp_path / "dock"
    shutil.copytree(DOCK, copy)
    (copy / "keys.ts").write_text((copy / "keys.ts").read_text(encoding="utf-8") + "\n", encoding="utf-8")
    (copy / "dom.ts").unlink()
    (copy / "mine.ts").write_text("import { api } from '../engine/client';\n", encoding="utf-8")
    problems = agents().dock_problems(copy)
    assert "keys.ts differs from MANIFEST.json" in problems
    assert "dom.ts is missing" in problems
    assert "mine.ts is extra" in problems
    assert "mine.ts imports ../engine/client from outside the dock folder" in problems


def test_the_agent_manifest_describes_the_dock():
    dock = json.loads((REPO / "agents" / "manifest.json").read_text(encoding="utf-8"))["dock"]
    assert dock == {"present": True, "positions": ["left", "right", "bottom", "floating"], "tabs": ["shell", "claude", "codex", "cursor", "antigravity"]}
    adapter = (FRONTEND / "src" / "dock-adapter.ts").read_text(encoding="utf-8")
    assert "builtin: ['shell', 'claude', 'codex', 'cursor', 'antigravity']" in adapter and "DockAdapter<Agy>" in adapter


def test_the_dialog_offers_only_what_the_engine_sends():
    adapter = (FRONTEND / "src" / "dock-adapter.ts").read_text(encoding="utf-8")
    assert "(['deny', 'once', 'always'] as ConsentChoice[]).filter((choice) => answers.includes(choice))" in adapter
    assert "remember: choice === 'deny' ? 'none' : choice" in adapter
    assert "mode: 'hosted'" in adapter


def test_the_old_terminal_panel_is_gone():
    assert not (FRONTEND / "src" / "panels" / "terminal.ts").exists()
    for path in (FRONTEND / "src").rglob("*"):
        if path.is_file() and path.suffix in (".ts", ".css") and DOCK not in path.parents:
            text = path.read_text(encoding="utf-8")
            assert "fx-term" not in text and "askConsent" not in text, path.name


def test_a_waiting_question_is_sent_again_to_a_window_that_connects():
    import asyncio

    from app.engine.bus import Bus

    async def run():
        bus = Bus()
        bus.join("ui")
        asked = asyncio.create_task(bus.ask_window({"type": "consent", "agent": "probe"}, timeout=5))
        await asyncio.sleep(0)
        waiting = bus.waiting()
        assert len(waiting) == 1 and waiting[0]["type"] == "consent" and waiting[0]["id"] == str(waiting[0]["requestId"])
        assert bus.answer(waiting[0]["requestId"], {"allow": False})
        assert await asked == {"allow": False}
        assert bus.waiting() == []

    asyncio.run(run())


def test_the_workspace_names_its_entry_for_tabs(tmp_path, monkeypatch):
    from app.agent import workspace

    assert workspace.TAB_ENTRY == "formencoder_tab"
    monkeypatch.setenv("FORMENCODER_DATA_DIR", str(tmp_path))
    workspace.ensure()
    base = workspace.root()
    assert list(json.loads((base / ".mcp.json").read_text(encoding="utf-8"))["mcpServers"]) == ["formencoder_tab"]
    assert list(json.loads((base / ".cursor" / "mcp.json").read_text(encoding="utf-8"))["mcpServers"]) == ["formencoder_tab"]
    assert "[mcp_servers.formencoder_tab]" in (base / ".codex" / "config.toml").read_text(encoding="utf-8")


def finder_version():
    return re.search(r'^VERSION = "([^"]+)"$', (REPO / LOOKUP).read_text(encoding="utf-8"), re.M).group(1)


def test_the_shared_finder_matches_the_hash_recorded_for_its_version():
    module = agents()
    assert module.LOOKUP_HASHES[finder_version()] == hashlib.sha256((REPO / LOOKUP).read_bytes()).hexdigest()
    assert module.lookup_problems() == []


def test_the_check_names_the_shared_finder_edited_in_place_or_missing(tmp_path, monkeypatch):
    module = agents()
    copy = tmp_path / "repo"
    (copy / "backend" / "app" / "services").mkdir(parents=True)
    shutil.copy(REPO / LOOKUP, copy / LOOKUP)
    monkeypatch.setattr(module, "ROOT", copy)
    monkeypatch.setattr(module, "LOOKUP", copy / LOOKUP)
    assert module.lookup_problems() == []
    with open(copy / LOOKUP, "a", encoding="utf-8") as f:
        f.write("\n")
    assert module.lookup_problems() == [f"{LOOKUP}: does not match the hash recorded for version {finder_version()} (the shared finder changes only as a whole new version)"]
    (copy / LOOKUP).unlink()
    assert module.lookup_problems() == [f"{LOOKUP}: missing (the shared finder for the agent programs)"]


def test_the_shared_finder_imports_nothing_from_the_app():
    imports = set(re.findall(r"^\s*(?:from|import)\s+([\w.]+)", (REPO / LOOKUP).read_text(encoding="utf-8"), re.M))
    assert imports == {"__future__", "dataclasses", "os", "pathlib", "re", "shutil", "signal", "subprocess", "sys", "threading", "time", "winreg"}
