from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

from . import client

_name = {"value": os.environ.get("FORMENCODER_AGENT_NAME", "")}
_profile = {"value": os.environ.get("FORMENCODER_MCP_PROFILE", "")}


def _url() -> str | None:
    explicit = os.environ.get("FORMENCODER_MCP_URL", "").strip()
    if explicit:
        return explicit
    base = client.engine_url()
    return f"{base}/mcp" if base else None


def forward(line: str) -> str | None:
    try:
        msg = json.loads(line)
    except ValueError:
        return json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}})
    params = msg.get("params") or {}
    if msg.get("method") == "initialize" and not _name["value"]:
        _name["value"] = "mcp:" + str((params.get("clientInfo") or {}).get("name") or "agent")
    version = (params.get("_meta") or {}).get("io.modelcontextprotocol/protocolVersion") or params.get("protocolVersion") or "2025-11-25"
    url = _url()
    if not url:
        if msg.get("id") is None:
            return None
        return json.dumps({"jsonrpc": "2.0", "id": msg.get("id"), "error": {"code": -32000, "message": "The formencoder engine is not running and could not be started: run ./formencoder boot in the formencoder folder (or open the desktop app), then retry."}})
    h = client.headers(_name["value"] or "mcp:agent")
    h["MCP-Protocol-Version"] = version
    if _profile["value"]:
        h["x-formencoder-mcp-profile"] = _profile["value"]
    req = urllib.request.Request(url, data=line.encode(), method="POST", headers=h)
    try:
        with urllib.request.urlopen(req, timeout=3600) as r:
            body = r.read().decode()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode() or ""
    except (urllib.error.URLError, OSError) as exc:
        print(f"[formencoder mcp] the engine is not answering at {url}: {exc}", file=sys.stderr, flush=True)
        if msg.get("id") is None:
            return None
        return json.dumps({"jsonrpc": "2.0", "id": msg.get("id"), "error": {"code": -32000, "message": f"The formencoder engine stopped answering ({exc}). Start it with ./formencoder boot and retry."}})
    if msg.get("id") is None:
        return None
    return body.strip() or None


def main() -> None:
    args = sys.argv[1:]
    if args and args[0] == "mcp":
        args = args[1:]
    for i, a in enumerate(args):
        if a == "--profile" and i + 1 < len(args):
            _profile["value"] = args[i + 1]
        elif a.startswith("--profile="):
            _profile["value"] = a.split("=", 1)[1]
    for line in sys.stdin:
        if not line.strip():
            continue
        out = forward(line)
        if out:
            sys.stdout.write(out + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
