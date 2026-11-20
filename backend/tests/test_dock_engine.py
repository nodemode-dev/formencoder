import asyncio
import json
import os
import time

import pytest

from conftest import CHANGING_TOOL, INAPP_HEADER, LOCAL_HEADER, MCP_PATH, window_ticket

LOCAL = {LOCAL_HEADER: "1"}
POSIX_ONLY = pytest.mark.skipif(os.name == "nt", reason="the stand-ins are shell scripts")
REFUSED = {"detail": "Only the formencoder window can do this"}


@pytest.fixture
def stand_ins(tmp_path, monkeypatch):
    folder = tmp_path / "bin"
    folder.mkdir()
    for name in ("claude", "codex", "cursor-agent", "agy"):
        script = folder / name
        script.write_text(f'#!/bin/sh\nif [ "$1" = "--version" ]; then echo "{name} 9.9.9"; exit 0; fi\n'
                          'echo "stand-in args=$*"\necho "token-present=${FORMENCODER_AGENT_TOKEN:+yes}"\nread line\n')
        script.chmod(0o755)
    monkeypatch.setenv("PATH", f"{folder}{os.pathsep}{os.environ.get('PATH', '')}")
    return folder


@pytest.fixture
def no_programs(tmp_path, monkeypatch):
    monkeypatch.setenv("PATH", str(tmp_path))


def changing_call(client, token):
    name, args = CHANGING_TOOL
    r = client.post(MCP_PATH, json={"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": name, "arguments": args, "clientInfo": {"name": "tab-test"}}}, headers={INAPP_HEADER: token})
    return r.json()["result"]


def printed(client, tid, needle, seconds=5.0):
    end = time.monotonic() + seconds
    text = ""
    while time.monotonic() < end and needle not in text:
        text = client.get(f"/api/terminal/sessions/{tid}/output").json()["text"]
        time.sleep(0.05)
    return text


def test_a_question_says_when_it_expires_and_every_window_hears_when_it_ends():
    from app.engine.bus import Bus

    async def run():
        bus = Bus()
        one, two = bus.join("ui"), bus.join("ui")
        before = time.time()
        expired = await bus.ask_window({"type": "consent", "client": "mcp:x"}, timeout=0.05)
        asked, same = one.queue.get_nowait(), two.queue.get_nowait()
        ended = [one.queue.get_nowait(), two.queue.get_nowait()]
        task = asyncio.create_task(bus.ask_window({"type": "consent", "client": "mcp:x"}, timeout=5))
        await asyncio.sleep(0.01)
        again = one.queue.get_nowait()
        two.queue.get_nowait()
        assert bus.answer(again["requestId"], {"allow": True})
        reply = await task
        return expired, asked, same, before, ended, again, reply, one.queue.get_nowait(), two.queue.get_nowait()

    expired, asked, same, before, ended, again, reply, told_one, told_two = asyncio.run(run())
    assert expired is None and same == asked
    assert asked["id"] == str(asked["requestId"]) and asked["expiresIn"] == 0.05 and before <= asked["expiresAt"] <= time.time() + 0.05
    gone = {"type": "withdrawn", "requestId": asked["requestId"], "id": asked["id"], "of": "consent", "reason": "expired"}
    assert ended == [gone, gone]
    assert reply == {"allow": True}
    answered = {"type": "withdrawn", "requestId": again["requestId"], "id": again["id"], "of": "consent", "reason": "answered"}
    assert told_one == answered and told_two == answered


def test_a_question_that_has_its_own_id_keeps_it():
    from app.engine.bus import Bus

    async def run():
        bus = Bus()
        window = bus.join("ui")
        await bus.ask_window({"type": "extensions", "id": "some.extension"}, timeout=0.01)
        return window.queue.get_nowait()

    assert asyncio.run(run())["id"] == "some.extension"


def test_the_agent_status_names_each_program_its_version_and_its_install_line(client, bare, stand_ins):
    assert bare.get("/api/terminal/agents").status_code == 403
    agents = client.get("/api/terminal/agents").json()["agents"]
    assert list(agents) == ["claude", "codex", "cursor", "antigravity"]
    assert agents["codex"] == agents["codex"] | {"installed": True, "path": str(stand_ins / "codex"), "version": "9.9.9", "finding": "runs", "how": "path", "signedIn": None, "title": "Codex", "program": "codex"}
    assert agents["cursor"]["version"] == "9.9.9" and agents["claude"]["version"] == "9.9.9"
    assert agents["codex"]["said"] == f"Codex is at {stand_ins / 'codex'} (the engine's PATH)."
    assert all(a["install"] for a in agents.values())


def test_the_agent_status_says_what_is_missing(client, no_programs):
    agents = client.get("/api/terminal/agents").json()["agents"]
    for kind in ("claude", "codex", "cursor", "antigravity"):
        assert agents[kind]["installed"] is False and agents[kind]["path"] is None and agents[kind]["version"] is None and agents[kind]["install"]
        assert agents[kind]["finding"] == "missing" and agents[kind]["looked"] and "was not found. Looked in:" in agents[kind]["said"]
    assert client.get("/api/terminal/status").json()["agents"] == {"claude": False, "codex": False, "cursor": False, "antigravity": False}


@POSIX_ONLY
def test_a_program_that_does_not_start_is_found_and_reported_as_broken(client, tmp_path, monkeypatch):
    folder = tmp_path / "bin"
    folder.mkdir()
    script = folder / "codex"
    script.write_text("#!/bin/sh\necho 'node: not found' >&2\nexit 127\n")
    script.chmod(0o755)
    monkeypatch.setenv("PATH", str(folder))
    codex = client.get("/api/terminal/agents").json()["agents"]["codex"]
    assert codex == codex | {"installed": False, "path": str(script), "finding": "broken", "error": "node: not found", "version": None}
    refused = client.post("/api/terminal/tabs", headers=LOCAL, json={"kind": "codex"})
    assert refused.status_code == 404 and "but does not start: node: not found" in refused.json()["detail"]["message"]


@POSIX_ONLY
def test_a_program_outside_the_engine_path_is_found_in_a_known_folder_and_through_the_shell(client, tmp_path, monkeypatch):
    home = tmp_path / "home"
    known, named = home / ".local" / "bin", tmp_path / "elsewhere"
    for folder, name in ((known, "claude"), (named, "codex")):
        folder.mkdir(parents=True)
        script = folder / name
        script.write_text('#!/bin/sh\nif [ "$1" = "--version" ]; then echo "7.7.7"; exit 0; fi\nread line\n')
        script.chmod(0o755)
    (home / ".zshrc-path").write_text(str(named))
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("PATH", "/usr/bin:/bin")
    agents = client.get("/api/terminal/agents").json()["agents"]
    assert agents["claude"] == agents["claude"] | {"installed": True, "path": str(known / "claude"), "how": "folder", "version": "7.7.7"}
    assert agents["codex"] == agents["codex"] | {"installed": True, "path": str(named / "codex"), "how": "shell", "version": "7.7.7"}
    assert agents["cursor"]["finding"] == "missing"


@POSIX_ONLY
@pytest.mark.parametrize("kind,title", [("claude", "Claude Code"), ("codex", "Codex"), ("cursor", "Cursor"), ("antigravity", "Antigravity")])
def test_an_agent_tab_runs_the_program_with_its_own_token_which_dies_with_the_tab(client, stand_ins, kind, title):
    from app.agent import consent
    from app.routers.terminal import hub

    row = client.post("/api/terminal/tabs", headers=LOCAL, json={"kind": kind, "cols": 80, "rows": 24}).json()
    assert row == row | {"kind": kind, "title": title, "alive": True, "owned": False}
    term = hub.terms[row["id"]]
    token = term.token
    assert consent.inapp(token) and all(token not in part for part in term.argv)
    assert "token-present=yes" in printed(client, row["id"], "token-present")
    assert not changing_call(client, token).get("isError")
    assert [t["id"] for t in client.get("/api/terminal/tabs").json()["tabs"]] == [row["id"]]
    assert row["id"] not in [t["id"] for t in hub.listing()]
    with pytest.raises(KeyError):
        hub.listed(row["id"])
    assert client.delete(f"/api/terminal/sessions/{row['id']}", headers=LOCAL).json() == {"closed": row["id"]}
    assert not consent.inapp(token)
    assert client.get("/api/terminal/tabs").json()["tabs"] == []


@POSIX_ONLY
def test_an_antigravity_tab_has_its_entry_in_a_folder_of_its_own_until_it_closes(client, stand_ins):
    from pathlib import Path

    from app.agent import consent, workspace
    from app.core import config
    from app.routers.terminal import hub

    shared = workspace.ensure() / ".agents" / "mcp_config.json"
    seed = json.dumps({"mcpServers": {"other": {"command": "/bin/true", "args": []}}, "theme": "kept"}, indent=2) + "\n"
    shared.parent.mkdir(parents=True, exist_ok=True)
    shared.write_text(seed, encoding="utf-8")
    row = client.post("/api/terminal/tabs", headers=LOCAL, json={"kind": "antigravity", "cwd": "/tmp"}).json()
    term = hub.terms[row["id"]]
    folder = Path(term.cwd)
    assert row["kind"] == "antigravity" and folder == config.data_dir() / "agent-tabs" / "antigravity" / f"{os.getpid()}-{row['id']}"
    path = folder / ".agents" / "mcp_config.json"
    held = json.loads(path.read_text(encoding="utf-8"))
    assert list(held["mcpServers"]) == ["formencoder_tab"]
    entry = held["mcpServers"]["formencoder_tab"]
    assert entry["command"] == workspace.mcp_command()[0] and entry["args"] == ["mcp", "--profile", "core"]
    assert entry["env"]["FORMENCODER_AGENT_TOKEN"] == term.token and consent.inapp(term.token)
    assert path.stat().st_mode & 0o777 == 0o600
    assert (folder / "AGENTS.md").read_text(encoding="utf-8") == (workspace.root() / "AGENTS.md").read_text(encoding="utf-8")
    assert "token-present=yes" in printed(client, row["id"], "token-present")
    token = term.token
    client.delete(f"/api/terminal/sessions/{row['id']}", headers=LOCAL)
    assert not folder.exists() and not consent.inapp(token)
    assert shared.read_text(encoding="utf-8") == seed
    shared.unlink()


@POSIX_ONLY
def test_two_antigravity_tabs_keep_an_entry_each_and_closing_one_leaves_the_others(client, stand_ins):
    from pathlib import Path

    from app.agent import consent
    from app.routers.terminal import hub

    first = client.post("/api/terminal/tabs", headers=LOCAL, json={"kind": "antigravity"}).json()
    second = client.post("/api/terminal/tabs", headers=LOCAL, json={"kind": "antigravity"}).json()
    one, two = hub.terms[first["id"]], hub.terms[second["id"]]
    files = [Path(term.cwd) / ".agents" / "mcp_config.json" for term in (one, two)]
    assert one.cwd != two.cwd and one.token != two.token

    def token_in(path):
        return json.loads(path.read_text(encoding="utf-8"))["mcpServers"]["formencoder_tab"]["env"]["FORMENCODER_AGENT_TOKEN"]

    assert [token_in(path) for path in files] == [one.token, two.token]
    kept = one.token
    client.delete(f"/api/terminal/sessions/{second['id']}", headers=LOCAL)
    assert not Path(two.cwd).exists()
    assert token_in(files[0]) == kept and consent.inapp(kept) and not changing_call(client, kept).get("isError")
    client.delete(f"/api/terminal/sessions/{first['id']}", headers=LOCAL)
    assert not Path(one.cwd).exists() and not consent.inapp(kept)


def test_a_tab_folder_that_holds_something_else_is_kept_and_a_file_that_is_not_json_gives_a_sentence(tmp_path):
    from app.services import agent_programs as finder

    folder = tmp_path / "agent-tabs" / "antigravity" / "1-t1"
    finder.write_tab_entry(folder, {"env": {finder.TOKEN_VAR: "abc"}})
    (folder / "notes.txt").write_text("mine")
    finder.remove_tab_entry(folder, "abc")
    finder.clear_tab_folder(folder)
    assert sorted(p.name for p in folder.iterdir()) == ["notes.txt"]
    elsewhere = tmp_path / "somewhere" / "else" / "t1"
    finder.write_tab_entry(elsewhere, {"env": {finder.TOKEN_VAR: "abc"}})
    finder.remove_tab_entry(elsewhere, "abc")
    finder.clear_tab_folder(elsewhere)
    assert (elsewhere / ".agents" / "mcp_config.json").is_file()
    (folder / ".agents").mkdir()
    (folder / ".agents" / "mcp_config.json").write_text("{not json")
    with pytest.raises(OSError, match="is not an MCP servers file formencoder can read, so it was left alone"):
        finder.write_tab_entry(folder, {"env": {}})
    assert (folder / ".agents" / "mcp_config.json").read_text() == "{not json"


def test_agents_install_adds_formencoder_to_antigravity_and_leaves_a_foreign_entry_alone(tmp_path):
    from app.agent import connect

    cfg = tmp_path / ".gemini" / "config" / "mcp_config.json"
    older = tmp_path / ".gemini" / "antigravity-cli" / "mcp_config.json"
    older.parent.mkdir(parents=True)
    older.write_text("{}", encoding="utf-8")
    said: list = []
    connect.install_antigravity(tmp_path, True, said)
    assert not cfg.exists() and "an older file was seen" in said[1]
    connect.install_antigravity(tmp_path, False, said)
    entry = {"command": connect.launch(), "args": ["mcp", "--profile", "core"]}
    assert json.loads(cfg.read_text(encoding="utf-8")) == {"mcpServers": {"formencoder": entry}} and older.read_text(encoding="utf-8") == "{}"
    again: list = []
    connect.install_antigravity(tmp_path, False, again)
    assert again == ["Antigravity:", f"  MCP server formencoder already in {cfg}"] and sorted(p.name for p in cfg.parent.iterdir()) == ["mcp_config.json"]
    foreign = json.dumps({"mcpServers": {"formencoder": {"command": "/somewhere/else", "args": ["x"]}, "kept": {"command": "k"}}, "top": 1})
    cfg.write_text(foreign, encoding="utf-8")
    left: list = []
    connect.install_antigravity(tmp_path, False, left)
    assert cfg.read_text(encoding="utf-8") == foreign and "did not write; left alone" in left[1]
    cfg.write_text("[1]", encoding="utf-8")
    unread: list = []
    connect.install_antigravity(tmp_path, False, unread)
    assert cfg.read_text(encoding="utf-8") == "[1]" and "is not an MCP servers file" in unread[1]
    assert list(connect.CLIENTS) == ["claude", "codex", "cursor", "antigravity"] and connect.install(["vim"], True) == ["unknown client vim (claude, codex, cursor or antigravity)"]


@POSIX_ONLY
def test_a_prompt_and_a_resume_id_reach_the_program_as_arguments(client, stand_ins):
    from app.routers.terminal import hub
    from app.services import agent_lookup

    row = client.post("/api/terminal/tabs", headers=LOCAL, json={"kind": "claude", "prompt": "make a small file", "resume": "0123abcd-4567"}).json()
    assert hub.terms[row["id"]].argv == agent_lookup.start_argv([str(stand_ins / "claude"), "--resume", "0123abcd-4567", "make a small file"])
    assert hub.terms[row["id"]].argv[:3] == [os.environ["SHELL"], "-l", "-c"]
    assert "args=--resume 0123abcd-4567 make a small file" in printed(client, row["id"], "args=")
    dashed = client.post("/api/terminal/tabs", headers=LOCAL, json={"kind": "codex", "prompt": "-v"}).json()
    assert hub.terms[dashed["id"]].argv == agent_lookup.start_argv([str(stand_ins / "codex"), "--", "-v"])
    assert "args=-- -v" in printed(client, dashed["id"], "args=")
    for tid in (row["id"], dashed["id"]):
        client.delete(f"/api/terminal/sessions/{tid}", headers=LOCAL)


@POSIX_ONLY
def test_a_plain_shell_tab_carries_no_token_and_stays_out_of_the_agent_list(client):
    from app.routers.terminal import hub

    row = client.post("/api/terminal/tabs", headers=LOCAL, json={"kind": "shell"}).json()
    term = hub.terms[row["id"]]
    assert row["kind"] == "shell" and term.token is None and term.window
    assert row["id"] not in [t["id"] for t in client.get("/api/terminal/sessions").json()["sessions"]]
    client.delete(f"/api/terminal/sessions/{row['id']}", headers=LOCAL)


def test_opening_a_tab_refuses_what_it_cannot_start(client, bare, no_programs):
    assert bare.post("/api/terminal/tabs", headers=LOCAL, json={"kind": "codex"}).json() == REFUSED
    missing = client.post("/api/terminal/tabs", headers=LOCAL, json={"kind": "codex"})
    assert missing.status_code == 404 and missing.json()["detail"] == missing.json()["detail"] | {"code": "not_installed", "install": "npm install -g @openai/codex"}
    assert client.post("/api/terminal/tabs", headers=LOCAL, json={"kind": "vim"}).json()["detail"]["code"] == "unknown_kind"
    assert client.post("/api/terminal/tabs", headers=LOCAL, json={"kind": "shell", "prompt": "x"}).status_code == 422
    assert client.post("/api/terminal/tabs", headers=LOCAL, json={"kind": "codex", "resume": "0123abcd-4567"}).status_code == 422


@POSIX_ONLY
def test_the_typed_socket_keeps_control_apart_from_output(client, stand_ins):
    from app.agent import consent
    from app.routers.terminal import hub

    row = client.post("/api/terminal/tabs", headers=LOCAL, json={"kind": "codex"}).json()
    token = hub.terms[row["id"]].token
    with client.websocket_connect(f"/api/terminal/ws?session={row['id']}&typed=1&cols=80&rows=24&ticket={window_ticket()}") as ws:
        assert json.loads(ws.receive_bytes()) == {"type": "hello", "id": row["id"], "kind": "codex", "alive": True}
        ws.send_text("not json")
        ws.send_text(json.dumps({"type": "resize", "cols": 90, "rows": 30}))
        ws.send_text(json.dumps({"type": "input", "data": "done\r"}))
        text, control = "", None
        while control is None:
            frame = ws.receive()
            if frame.get("bytes") is not None:
                control = json.loads(frame["bytes"])
            else:
                text += frame.get("text") or ""
        assert control == {"type": "exit"} and '{"exit": true}' not in text
        assert not consent.inapp(token)
        assert client.get("/api/terminal/tabs").json()["tabs"][0]["alive"] is False
        client.delete(f"/api/terminal/sessions/{row['id']}", headers=LOCAL)
        assert json.loads(ws.receive_bytes()) == {"type": "closed"}
    with client.websocket_connect(f"/api/terminal/ws?session=t0&typed=1&ticket={window_ticket()}") as ws:
        assert json.loads(ws.receive_bytes()) == {"type": "gone", "id": "t0"}
