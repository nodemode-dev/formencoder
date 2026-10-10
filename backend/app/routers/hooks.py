from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request

from ..engine import links
from ..engine import rpc as engine_rpc
from ..engine.host import host

router = APIRouter(tags=["family"])


@router.post("/api/family/hooks/formcut")
async def formcut_hook(request: Request) -> dict:
    link = links.read().get("formcut")
    if not link:
        raise HTTPException(404, "formencoder is not linked to formcut; run family.linkFormcut")
    stamp = request.headers.get("x-formcut-timestamp", "")
    signature = request.headers.get("x-formcut-signature", "")
    data: bytes | None = None
    filename = None
    if request.headers.get("content-type", "").startswith("multipart/"):
        form = await request.form()
        raw = form.get("payload")
        signed = (raw if isinstance(raw, str) else "").encode()
        upload = form.get("file")
        if upload is not None and hasattr(upload, "read"):
            data = await upload.read()
            filename = getattr(upload, "filename", None)
    else:
        signed = await request.body()
    if not links.verify(link["secret"], stamp, signed, signature):
        raise HTTPException(401, "the formcut signature does not match this link")
    try:
        payload = json.loads(signed.decode() or "{}")
    except ValueError:
        raise HTTPException(422, "the formcut payload is not JSON") from None
    try:
        got = links.accept(payload, data, filename)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    if got.get("path") and host.available:
        params = {"paths": [got["path"]], "start": got["start"]}
        if got.get("preset"):
            params["preset"] = got["preset"]
        if got.get("folder"):
            params["folder"] = got["folder"]
        try:
            added = await engine_rpc.execute("queue.addSource", params, "formcut")
        except engine_rpc.RpcError as exc:
            raise HTTPException(422, f"formencoder could not queue {got['path']}: {exc}") from None
        host.bus.publish({"type": "toast", "text": f"formcut sent {got['path'].rsplit('/', 1)[-1]}", "kind": "ok"})
        got["queued"] = added
    return got
