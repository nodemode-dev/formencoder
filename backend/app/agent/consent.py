from __future__ import annotations

import asyncio
import contextlib
import json
import secrets
import time

from ..core import config, seal
from ..engine.host import host

TOKENS: set[str] = set()
_session: set[str] = set()
_declined: dict[str, float] = {}
ANSWERS = ("deny", "once", "session", "always")
ALWAYS_SCOPE = "agent"
ASK_SECONDS = 180.0
BLOCKED = ("Outside agents are turned off (FORMENCODER_AGENTS=deny), and so are agents started inside formencoder. "
           "Only the person can change this, by starting formencoder without that setting.")
_READ_RPC = {"command.list", "command.describe", "ui.state", "menu.bar", "frame.png", "encode.wait", "engine.info", "activity.list", "family.discover", "family.sources", "publish.destinations", "agents.approvals", "extensions.list"}


def issue() -> str:
    token = secrets.token_urlsafe(32)
    TOKENS.add(token)
    return token


def revoke(token: str | None) -> None:
    if token:
        TOKENS.discard(token)


def inapp(token: str | None) -> bool:
    return bool(token) and any(secrets.compare_digest(token, t) for t in list(TOKENS))


def _store():
    return config.data_dir() / "agents.json"


def _stored() -> dict:
    try:
        found = json.loads(_store().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return found if isinstance(found, dict) else {}


def seal_state() -> str:
    stored = _stored()
    return seal.read("agents", stored, bool(stored.get("allowed")))


def _always() -> set[str]:
    stored = _stored()
    if seal.read("agents", stored, bool(stored.get("allowed"))) == "broken":
        return set()
    allowed = stored.get("allowed", [])
    return {str(a) for a in allowed} if isinstance(allowed, list) else set()


def _remember(client: str) -> None:
    allowed = _always() | {client}
    _store().write_text(json.dumps(seal.sign("agents", {"allowed": sorted(allowed)}), indent=2), encoding="utf-8")


def forget_all() -> None:
    _session.clear()
    try:
        _store().unlink()
    except OSError:
        pass


def query_command(command: str | None) -> bool:
    from ..engine.rpc import query_ids

    return bool(command) and command in query_ids()


def mutating_rpc(message) -> bool:
    if isinstance(message, list):
        return any(mutating_rpc(m) for m in message)
    if not isinstance(message, dict):
        return False
    method = message.get("method", "")
    if method in _READ_RPC:
        return False
    if method == "command.execute":
        return not query_command((message.get("params") or {}).get("command"))
    return True


def client_key(source: str) -> str:
    return source.split(":", 1)[-1].strip().lower() or "agent"


def agent_name(source: str) -> str:
    return source.split(":", 1)[-1].strip()[:60] or "agent"


def state() -> dict:
    from . import approvals

    seals = seal.summary([seal_state(), approvals.seal_state()])
    return {"policy": config.agents_policy(), "session": sorted(_session), "always": sorted(_always()), "seal": seals, "sealBroken": seals == "broken",
            "answers": list(ANSWERS), "alwaysScope": ALWAYS_SCOPE, "askSeconds": ASK_SECONDS, "blockedStopsTabs": True}


GONE = "The caller went away before the person answered."


async def gate_for(request, source: str, token: str | None, mutating: bool, detail: str = "", what: str = "") -> str | None:
    asking = asyncio.ensure_future(gate(source, token, mutating, detail=detail, what=what))
    while True:
        done, _ = await asyncio.wait({asking}, timeout=1.0)
        if done:
            return asking.result()
        if await request.is_disconnected():
            asking.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await asking
            return GONE


async def gate(source: str, token: str | None, mutating: bool, detail: str = "", what: str = "") -> str | None:
    if not mutating:
        return None
    policy = config.agents_policy()
    if policy == "deny":
        return BLOCKED
    if inapp(token):
        return None
    key = client_key(source)
    if key in _session or key in _always():
        return None
    if _declined.get(key, 0) > time.monotonic():
        return "The person declined changes from this agent a moment ago. Ask them in chat before trying again."
    if not host.bus.windows():
        return ("No formencoder window is open to ask the person for permission. Open formencoder (./formencoder boot, then http://localhost:5270, "
                "or the desktop app) and allow this agent, or start the agent from formencoder's Terminal panel.")
    asked = what or (f"use the {detail} tool" if detail else "make changes")
    question = {"type": "consent", "client": source, "detail": detail, "agent": agent_name(source), "what": asked, "answers": list(ANSWERS), "alwaysScope": ALWAYS_SCOPE}
    reply = await host.bus.ask_window(question, timeout=ASK_SECONDS)
    if not reply:
        return "Nobody answered the permission request in the formencoder window. Ask the person to allow the agent there, then retry."
    if reply.get("allow"):
        remember = "once" if reply.get("once") else reply.get("remember")
        if remember == "always":
            _remember(key)
        if remember != "once":
            _session.add(key)
        return None
    _declined[key] = time.monotonic() + 600
    return "The person declined changes from this agent. Ask them in chat what they want instead."
