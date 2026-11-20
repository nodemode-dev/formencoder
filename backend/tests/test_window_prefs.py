import pytest

from conftest import LOCAL_HEADER, set_policy

MESSAGE = "Only the person, in the formencoder window (Preferences), can change"


@pytest.fixture
def allowed(monkeypatch):
    from app.agent import consent

    set_policy("ask")
    monkeypatch.setattr(consent, "_session", {"cli", "ui"})
    yield
    set_policy("ask")


def rpc(client, method, params, source="cli"):
    return client.post("/api/rpc", json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, headers={LOCAL_HEADER: "1", "x-formencoder-source": source}).json()


@pytest.mark.parametrize("values", [{"ffmpegDir": "/tmp/formencoder-elsewhere"}, {"incrementNames": False}, {"rawDecoders": [{"extensions": ["r3d"], "command": "/bin/true"}]}, {"cacheFolder": "/tmp"}])
def test_agents_cannot_change_window_only_preferences(client, allowed, values):
    out = rpc(client, "command.execute", {"command": "prefs.set", "params": {"values": values}})
    assert MESSAGE in out["error"]["message"]
    batch = rpc(client, "command.batch", {"steps": [{"command": "prefs.set", "params": {"values": values}}]})
    assert MESSAGE in batch["error"]["message"]


def test_a_source_naming_itself_ui_is_still_an_agent(client, allowed):
    out = rpc(client, "command.execute", {"command": "prefs.set", "params": {"values": {"incrementNames": False}}}, source="ui")
    assert MESSAGE in out["error"]["message"]


def test_agents_can_still_change_other_preferences(client, allowed):
    out = rpc(client, "command.execute", {"command": "prefs.set", "params": {"values": {"chime": True}}})
    assert out["result"]["prefs"]["chime"] is True


def test_the_window_can_change_them():
    from app.engine import rpc as engine_rpc

    engine_rpc.window_only("prefs.set", {"values": {"incrementNames": False, "ffmpegDir": ""}}, "ui")
    with pytest.raises(engine_rpc.RpcError):
        engine_rpc.window_only("prefs.set", {"values": {"ffmpegDir": ""}}, "mcp:agent")
