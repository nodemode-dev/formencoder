import json

from fastapi import APIRouter, Request, Response

from .. import __version__
from ..agent import consent, tools
from ..core.security import local_origin

router = APIRouter(tags=["mcp"])
VERSIONS = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"]


def _ok(rid, result: dict, modern: bool) -> dict:
    return {"jsonrpc": "2.0", "id": rid, "result": {**result, **({"resultType": "complete"} if modern else {})}}


def _err(rid, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": rid, "error": {"code": code, "message": message}}


def _json(body: dict, status: int = 200) -> Response:
    return Response(content=json.dumps(body), media_type="application/json", status_code=status)


@router.post("/mcp")
async def mcp(request: Request) -> Response:
    if not local_origin(request.headers.get("origin")):
        return _json(_err(None, -32600, "Origin not allowed"), 403)
    try:
        msg = json.loads(await request.body())
    except ValueError:
        return _json(_err(None, -32700, "Parse error"), 400)
    if isinstance(msg, list):
        return _json(_err(None, -32600, "Batches are not supported"), 400)
    rid, method, params = msg.get("id"), msg.get("method"), msg.get("params") or {}
    if rid is None:
        return Response(status_code=202)
    meta = params.get("_meta") or {}
    version = meta.get("io.modelcontextprotocol/protocolVersion") or request.headers.get("mcp-protocol-version") or "2025-11-25"
    modern = version == "2026-07-28"
    server = {"name": "formencoder", "version": __version__}
    client = request.headers.get("x-formencoder-source") or "mcp:" + str((params.get("clientInfo") or {}).get("name") or request.headers.get("user-agent", "agent").split("/")[0])
    if client.strip().lower() == "ui":
        client = "mcp:agent"
    token = request.headers.get("x-formencoder-agent-token")
    profile = request.query_params.get("profile") or request.headers.get("x-formencoder-mcp-profile")
    caps = {"tools": {}, "prompts": {}, "resources": {}}
    if method == "initialize":
        asked = params.get("protocolVersion")
        out = _ok(rid, {"protocolVersion": asked if asked in VERSIONS else "2025-11-25", "capabilities": caps, "serverInfo": server, "instructions": tools.INSTRUCTIONS}, False)
    elif version not in VERSIONS:
        out = _err(rid, -32602, f"Unsupported protocol version {version}; supported: {', '.join(VERSIONS)}")
    elif method == "server/discover":
        out = _ok(rid, {"supportedVersions": VERSIONS, "capabilities": caps, "_meta": {"io.modelcontextprotocol/serverInfo": server}, "instructions": tools.INSTRUCTIONS}, True)
    elif method == "ping":
        out = _ok(rid, {}, modern)
    elif method == "prompts/list":
        out = _ok(rid, {"prompts": tools.PROMPTS}, modern)
    elif method == "prompts/get":
        try:
            got = tools.prompt(str(params.get("name")), params.get("arguments"))
        except ValueError as exc:
            got, out = None, _err(rid, -32602, str(exc))
        else:
            out = _ok(rid, got, modern) if got else _err(rid, -32602, f"No prompt named {params.get('name')}")
    elif method == "resources/list":
        out = _ok(rid, {"resources": tools.RESOURCES}, modern)
    elif method == "resources/templates/list":
        out = _ok(rid, {"resourceTemplates": tools.RESOURCE_TEMPLATES}, modern)
    elif method == "resources/read":
        try:
            out = _ok(rid, await tools.read_resource(str(params.get("uri") or ""), client), modern)
        except Exception as exc:
            out = _err(rid, -32002, f"{exc}")
    elif method == "tools/list":
        out = _ok(rid, {"tools": await tools.listing(profile)}, modern)
    elif method == "tools/call":
        name, args = params.get("name"), params.get("arguments") or {}
        if not isinstance(name, str) or not await tools.known(name) or not isinstance(args, dict):
            out = _err(rid, -32602, f"No tool named {name}")
        else:
            mutating = not tools.read_only(name) and not (name == "execute" and consent.query_command(args.get("command")))
            denied = await consent.gate(client, token, mutating, detail=name)
            out = _ok(rid, tools.fail(denied) if denied else await tools.call(name, args, client), modern)
    else:
        out = _err(rid, -32601, f"Method not found: {method}")
    return _json(out)


@router.get("/api/agents/consent")
def consent_state() -> dict:
    return consent.state()
