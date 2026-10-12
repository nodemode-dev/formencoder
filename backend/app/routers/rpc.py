import json
import time

from fastapi import APIRouter, Request, Response

from ..agent import approvals, consent
from ..engine import rpc

router = APIRouter(tags=["rpc"])


def _label(message) -> str:
    if not isinstance(message, dict):
        return "batch of messages"
    p = message.get("params") or {}
    if message.get("method") == "command.execute":
        return str(p.get("command") or "command.execute")
    return str(message.get("method") or "rpc")


async def _reasons(message) -> list[str]:
    if isinstance(message, list):
        out: list[str] = []
        for m in message:
            out += await _reasons(m)
        return sorted(set(out))
    if not isinstance(message, dict):
        return []
    p = message.get("params") or {}
    if message.get("method") == "command.execute":
        return await approvals.reasons(str(p.get("command") or ""), p.get("params") or {})
    if message.get("method") == "command.batch":
        out = []
        for s in p.get("steps") or []:
            if isinstance(s, dict):
                out += await approvals.reasons(str(s.get("command") or ""), s.get("params") or {})
        return sorted(set(out))
    return []


@router.post("/api/rpc")
async def call(request: Request) -> Response:
    try:
        message = json.loads(await request.body())
    except ValueError:
        return Response(json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}}), media_type="application/json", status_code=400)
    source = request.headers.get("x-formencoder-source", "cli")[:60] or "cli"
    if source.strip().lower() == "ui":
        source = "cli"
    rid = message.get("id") if isinstance(message, dict) else None
    denied = await consent.gate(source, request.headers.get("x-formencoder-agent-token"), mutating=consent.mutating_rpc(message))
    if denied:
        return Response(json.dumps({"jsonrpc": "2.0", "id": rid, "error": {"code": -32003, "message": denied}}), media_type="application/json")
    why = await _reasons(message)
    started = time.monotonic()
    try:
        out = await approvals.guard(source, _label(message), why, (message or {}).get("params") if isinstance(message, dict) else message, lambda: rpc.handle(message, source))
    except approvals.Pending as p:
        return Response(json.dumps({"jsonrpc": "2.0", "id": rid, "error": {"code": -32004, "message": p.request["summary"] + ". It waits for the person in formencoder's Agent Connect panel.", "data": {"pendingApproval": p.request["id"]}}}), media_type="application/json")
    except approvals.Declined as exc:
        return Response(json.dumps({"jsonrpc": "2.0", "id": rid, "error": {"code": -32003, "message": str(exc)}}), media_type="application/json")
    if why or consent.mutating_rpc(message):
        failed = isinstance(out, dict) and "error" in out
        approvals.note(source, _label(message), (message or {}).get("params") if isinstance(message, dict) else None, not failed, (time.monotonic() - started) * 1000,
                       approval=("full faith" if approvals.full_faith() else "asked") if why else None, error=(out or {}).get("error", {}).get("message") if failed else None)
    if out is None:
        return Response(status_code=204)
    return Response(json.dumps(out), media_type="application/json")
