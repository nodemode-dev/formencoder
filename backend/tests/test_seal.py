import json

import pytest

keyring = pytest.importorskip("keyring")
from keyring.backend import KeyringBackend


class Memory(KeyringBackend):
    priority = 1

    def __init__(self):
        super().__init__()
        self.store = {}

    def get_password(self, service, username):
        return self.store.get((service, username))

    def set_password(self, service, username, password):
        self.store[(service, username)] = password

    def delete_password(self, service, username):
        self.store.pop((service, username), None)


class Missing(KeyringBackend):
    priority = 1

    def get_password(self, service, username):
        raise RuntimeError("no keychain")

    def set_password(self, service, username, password):
        raise RuntimeError("no keychain")

    def delete_password(self, service, username):
        raise RuntimeError("no keychain")


@pytest.fixture
def sealed(tmp_path, monkeypatch):
    from app.core import seal

    monkeypatch.setenv("FORMENCODER_DATA_DIR", str(tmp_path))
    before = keyring.get_keyring()
    keyring.set_keyring(Memory())
    seal.reset()
    yield tmp_path
    keyring.set_keyring(before)
    seal.reset()


def test_choices_the_window_makes_are_sealed_and_stand(sealed):
    from app.agent import approvals, consent

    consent._remember("claude")
    approvals.set_full_faith(True)
    assert consent.state()["seal"] == "ok" and consent.state()["always"] == ["claude"]
    assert approvals.full_faith() is True


def test_a_client_added_by_hand_is_caught_and_treated_as_ask(sealed):
    from app.agent import consent

    consent._remember("claude")
    stored = json.loads((sealed / "agents.json").read_text())
    stored["allowed"].append("intruder")
    (sealed / "agents.json").write_text(json.dumps(stored))
    state = consent.state()
    assert state["sealBroken"] is True and state["always"] == []


def test_full_faith_written_by_hand_is_ignored(sealed):
    from app.agent import approvals

    (sealed / "approvals.json").write_text(json.dumps({"fullFaith": True}))
    assert approvals.seal_state() == "broken" and approvals.full_faith() is False


def test_safe_values_without_a_seal_are_not_reported_broken(sealed):
    from app.agent import consent

    (sealed / "agents.json").write_text(json.dumps({"allowed": []}))
    assert consent.state()["sealBroken"] is False


def test_without_a_keychain_the_stored_values_stand(tmp_path, monkeypatch):
    from app.agent import approvals, consent
    from app.core import seal

    monkeypatch.setenv("FORMENCODER_DATA_DIR", str(tmp_path))
    before = keyring.get_keyring()
    keyring.set_keyring(Missing())
    seal.reset()
    try:
        (tmp_path / "agents.json").write_text(json.dumps({"allowed": ["claude"]}))
        state = consent.state()
        assert state["seal"] == "unavailable" and state["always"] == ["claude"]
        approvals.set_full_faith(False)
        assert json.loads((tmp_path / "approvals.json").read_text()) == {"fullFaith": False}
    finally:
        keyring.set_keyring(before)
        seal.reset()
