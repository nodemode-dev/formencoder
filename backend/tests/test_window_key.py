import json
import re

import pytest
from starlette.websockets import WebSocketDisconnect

from conftest import ENGINE_PORT, LOCAL_HEADER, inapp_token, window_ticket

READS = {"GET", "HEAD", "OPTIONS"}
OPEN = {("POST", "/mcp"), ("POST", "/api/window/key"), ("POST", "/api/rpc"), ("POST", "/api/family/hooks/formcut")}
LOOPBACK = {"host": f"127.0.0.1:{ENGINE_PORT}"}
REFUSED = {"detail": "Only the formencoder window can do this"}


def write_operations(app):
    return [(m.upper(), path) for path, item in app.openapi()["paths"].items() for m in item if m.upper() not in READS]


def test_the_open_list_is_short_and_named():
    from app.core import window_key

    assert set(window_key.OPEN) == {path for _, path in OPEN}


def test_every_write_route_needs_the_window_key(app, bare):
    ops = write_operations(app)
    assert len(ops) >= 15
    answered = []
    for method, path in ops:
        if (method, path) in OPEN:
            continue
        url = re.sub(r"\{[^}]+\}", "x", path)
        for headers in ({LOCAL_HEADER: "1"}, {LOCAL_HEADER: "1", "x-formencoder-window-key": "x" * 43}):
            r = bare.request(method, url, json={}, headers=headers)
            if r.status_code != 403 or r.json() != REFUSED:
                answered.append(f"{method} {path} {r.status_code}")
    assert not answered, "write routes that answer without the window key (add the key, or name the route in window_key.OPEN with its caller): " + ", ".join(answered)


def test_the_window_key_lets_the_window_write(client, tmp_path):
    r = client.post("/api/fs/mkdir", json={"path": str(tmp_path / "made")}, headers={LOCAL_HEADER: "1"})
    assert r.status_code == 200 and (tmp_path / "made").is_dir()


def test_the_bootstrap_answers_once_then_refuses(bare, monkeypatch):
    from app.core import window_key

    monkeypatch.setitem(window_key.STATE, "claimed", False)
    monkeypatch.setitem(window_key.STATE, "secondClaim", False)
    first = bare.post("/api/window/key", headers={LOCAL_HEADER: "1"})
    assert first.status_code == 200 and first.json()["key"] == window_key.KEY
    again = bare.post("/api/window/key", headers={LOCAL_HEADER: "1"})
    assert again.status_code == 409 and window_key.KEY not in again.text
    assert bare.get("/api/system").json()["secondWindowClaim"] is True


def test_the_bootstrap_does_not_exist_when_the_shell_holds_the_key(bare, monkeypatch):
    monkeypatch.setenv("FORMENCODER_WINDOW_KEY_STDOUT", "1")
    assert bare.post("/api/window/key", headers={LOCAL_HEADER: "1"}).status_code == 404


def test_a_ticket_needs_the_key_and_works_once(client, bare):
    assert bare.post("/api/window/ticket", headers={LOCAL_HEADER: "1"}).status_code == 403
    from app.core import window_key

    ticket = client.post("/api/window/ticket", headers={LOCAL_HEADER: "1"}).json()["ticket"]
    assert window_key.spend(ticket) is True
    assert window_key.spend(ticket) is False


def _ask(ws, method, params=None):
    ws.send_text(json.dumps({"jsonrpc": "2.0", "id": 7, "method": method, "params": params or {}}))
    while True:
        got = ws.receive_json()
        if got.get("id") == 7:
            return got


@pytest.mark.parametrize("method,params", [("agents.fullFaith", {"on": True}), ("agents.decide", {"id": 1, "allow": True}), ("agents.approvals", {}), ("command.execute", {"command": "app.capabilities", "params": {}})])
def test_a_socket_without_a_ticket_has_no_rights(bare, method, params):
    from app.agent import approvals
    from app.engine.host import host

    with bare.websocket_connect("/api/live?kind=ui", headers=LOOPBACK) as ws:
        assert ws.receive_json()["type"] == "hello"
        assert not host.bus.windows()
        assert _ask(ws, method, params)["error"]["message"] == REFUSED["detail"]
    assert approvals.full_faith() is False


def test_a_socket_with_a_ticket_is_the_window(bare):
    from app.engine.host import host

    with bare.websocket_connect(f"/api/live?kind=ui&ticket={window_ticket()}", headers=LOOPBACK) as ws:
        assert ws.receive_json()["type"] == "hello"
        assert len(host.bus.windows()) == 1
        assert "result" in _ask(ws, "agents.approvals")


def test_the_terminal_socket_needs_a_ticket(bare):
    with pytest.raises(WebSocketDisconnect):
        with bare.websocket_connect("/api/terminal/ws?cols=80&rows=24", headers=LOOPBACK) as ws:
            ws.receive_text()


def test_each_window_terminal_has_its_own_token_and_it_dies_with_the_terminal():
    from app.agent import consent
    from app.routers.terminal import _environment

    env = _environment("http://127.0.0.1:1", None)
    assert "FORMENCODER_AGENT_TOKEN" not in env
    token = consent.issue()
    assert consent.inapp(token)
    consent.revoke(token)
    assert not consent.inapp(token)
    assert not consent.inapp(inapp_token() + "x")


def test_a_terminal_an_agent_opens_carries_no_token(client):
    import asyncio

    from app.agent import consent
    from app.routers.terminal import hub

    async def run():
        before = set(consent.TOKENS)
        term = hub.open("probe", None, 80, 24, "http://127.0.0.1:1")
        try:
            assert term.token is None and set(consent.TOKENS) == before
        finally:
            hub.close(term.id)
        window = hub.open("window", None, 80, 24, "http://127.0.0.1:1", trusted=True)
        token = window.token
        assert consent.inapp(token)
        hub.close(window.id)
        assert not consent.inapp(token)

    asyncio.run(run())
