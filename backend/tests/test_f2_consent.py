import pytest

from conftest import CHANGING_TOOL, INAPP_HEADER, MCP_PATH, READ_TOOL, consent_refusals, inapp_token, set_policy


def rpc(client, method, params=None, headers=None, rid=1):
    r = client.post(MCP_PATH, json={"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}}, headers=headers or {})
    assert r.status_code == 200, r.text
    return r.json()


def call(client, tool, headers=None, agent="family-test-agent"):
    name, args = tool
    rpc(client, "initialize", {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": agent, "version": "1"}}, headers)
    return rpc(client, "tools/call", {"name": name, "arguments": args, "clientInfo": {"name": agent}}, headers, rid=2)


def text_of(reply):
    result = reply.get("result") or {}
    return " ".join(c.get("text", "") for c in result.get("content", []) if isinstance(c, dict))


def refused(reply, kind):
    return consent_refusals()[kind] in text_of(reply)


@pytest.fixture(autouse=True)
def policy_reset(monkeypatch):
    from app.agent import consent

    monkeypatch.setattr(consent, "_session", set())
    monkeypatch.setattr(consent, "_declined", {})
    set_policy("ask")
    yield
    consent.forget_all()
    set_policy("ask")


def with_window(monkeypatch, answer):
    from app.engine.host import host

    asked = []

    async def ask_window(message, timeout=0):
        asked.append(message)
        return answer

    monkeypatch.setattr(host.bus, "windows", lambda: ["window"])
    monkeypatch.setattr(host.bus, "ask_window", ask_window)
    return asked


def test_read_only_tool_never_asks(client):
    reply = call(client, READ_TOOL)
    assert "error" not in reply
    assert not refused(reply, "no_window")
    assert not reply["result"].get("isError")


def test_changing_tool_with_no_window_is_refused(client):
    reply = call(client, CHANGING_TOOL)
    assert refused(reply, "no_window")
    assert reply["result"].get("isError")


def test_blocked_policy_refuses_a_changing_tool(client):
    set_policy("blocked")
    reply = call(client, CHANGING_TOOL)
    assert refused(reply, "blocked")
    assert reply["result"].get("isError")


def test_blocked_policy_still_refuses_with_a_wrong_token(client):
    set_policy("blocked")
    assert call(client, CHANGING_TOOL, {INAPP_HEADER: "wrong-token"})["result"].get("isError")


@pytest.mark.parametrize("value", ["allow", "ALLOW", " allow ", "1", "true", "yes", "", "ask", "nonsense"])
def test_only_deny_changes_the_policy_and_everything_else_asks(client, monkeypatch, value):
    monkeypatch.setenv("FORMENCODER_AGENTS", value)
    reply = call(client, CHANGING_TOOL)
    assert refused(reply, "no_window")
    assert reply["result"].get("isError")


def test_unset_variable_asks(client, monkeypatch):
    monkeypatch.delenv("FORMENCODER_AGENTS", raising=False)
    assert refused(call(client, CHANGING_TOOL), "no_window")


@pytest.mark.parametrize("value", ["deny", "DENY", " deny "])
def test_deny_in_any_spelling_blocks(client, monkeypatch, value):
    monkeypatch.setenv("FORMENCODER_AGENTS", value)
    assert refused(call(client, CHANGING_TOOL), "blocked")


def test_deny_blocks_an_agent_the_person_allowed_always(client, monkeypatch):
    from app.agent import consent

    monkeypatch.setattr(consent, "_session", {"family-test-agent"})
    monkeypatch.setattr(consent, "_always", lambda: {"family-test-agent"})
    assert not call(client, CHANGING_TOOL)["result"].get("isError")
    set_policy("blocked")
    reply = call(client, CHANGING_TOOL)
    assert refused(reply, "blocked") and reply["result"].get("isError")


def test_allow_value_does_not_override_the_stored_choice_or_the_window(client, monkeypatch):
    monkeypatch.setenv("FORMENCODER_AGENTS", "allow")
    asked = with_window(monkeypatch, {"allow": False})
    reply = call(client, CHANGING_TOOL)
    assert len(asked) == 1 and "declined" in text_of(reply)


def test_allow_value_still_honours_a_stored_allow(client, monkeypatch):
    from app.agent import consent

    monkeypatch.setenv("FORMENCODER_AGENTS", "allow")
    monkeypatch.setattr(consent, "_always", lambda: {"family-test-agent"})
    assert not call(client, CHANGING_TOOL)["result"].get("isError")


def test_policy_function_reports_only_ask_or_deny(monkeypatch):
    from app.core import config

    for value, expected in [("allow", "ask"), ("deny", "deny"), ("", "ask"), ("Deny", "deny"), ("x", "ask")]:
        monkeypatch.setenv("FORMENCODER_AGENTS", value)
        assert config.agents_policy() == expected


def test_inapp_token_skips_the_ask(client):
    reply = call(client, CHANGING_TOOL, {INAPP_HEADER: inapp_token()})
    assert not refused(reply, "no_window")
    assert not reply["result"].get("isError")


def test_inapp_token_skips_a_blocked_policy(client):
    set_policy("blocked")
    assert not refused(call(client, CHANGING_TOOL, {INAPP_HEADER: inapp_token()}), "blocked")


@pytest.mark.parametrize("token", ["", "wrong-token", "x" * 64])
def test_wrong_inapp_token_does_not_skip_the_ask(client, token):
    assert refused(call(client, CHANGING_TOOL, {INAPP_HEADER: token}), "no_window")


def test_window_is_asked_and_allow_lasts_for_the_session(client, monkeypatch):
    asked = with_window(monkeypatch, {"allow": True})
    first = call(client, CHANGING_TOOL)
    second = call(client, CHANGING_TOOL)
    assert not first["result"].get("isError") and not second["result"].get("isError")
    assert len(asked) == 1 and asked[0]["type"] == "consent"


def test_decline_blocks_the_agent_for_the_cooldown(client, monkeypatch):
    asked = with_window(monkeypatch, {"allow": False})
    first = call(client, CHANGING_TOOL)
    assert first["result"].get("isError") and "declined" in text_of(first)
    with_window(monkeypatch, {"allow": True})
    second = call(client, CHANGING_TOOL)
    assert second["result"].get("isError") and "declined" in text_of(second)
    assert len(asked) == 1


def test_decline_of_one_agent_does_not_block_another(client, monkeypatch):
    with_window(monkeypatch, {"allow": False})
    assert call(client, CHANGING_TOOL, agent="agent-one")["result"].get("isError")
    with_window(monkeypatch, {"allow": True})
    assert not call(client, CHANGING_TOOL, agent="agent-two")["result"].get("isError")
