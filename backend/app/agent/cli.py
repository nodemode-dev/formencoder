from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from pathlib import Path

from . import client


def _load(raw: str | None) -> object:
    if raw is None:
        return {}
    p = Path(raw)
    text = p.read_text(encoding="utf-8") if not raw.lstrip().startswith(("{", "[")) and p.is_file() else raw
    try:
        return json.loads(text)
    except ValueError as exc:
        raise SystemExit(f"[formencoder] not JSON: {exc}") from None


def _print(value: object) -> None:
    print(json.dumps(value, indent=2, ensure_ascii=False))


def _queue_line(st: dict) -> None:
    c = st.get("counts") or {}
    print(f"{'running' if st.get('running') else 'idle'} · {c.get('total', 0)} outputs · {c.get('ready', 0)} ready · {c.get('encoding', 0)} encoding · {c.get('done', 0)} done · {c.get('failed', 0)} failed")
    for it in st.get("items", []):
        print(f"#{it['index']} {it['name']}  {it.get('video') or ''}")
        for o in it.get("outputs", []):
            pct = f"{100 * float(o.get('progress') or 0):.0f}%" if o.get("status") == "encoding" else ""
            print(f"   {o['id']}  {o.get('status', ''):<9}{pct:>5}  {o.get('formatLabel', '')} · {o.get('presetName', '')}  ->  {o.get('path', '')}")


PATH_KEYS = {"path", "paths", "folder", "destination", "transcodeFolder"}


def _types(spec: dict) -> list:
    t = spec.get("type")
    if t is None and spec.get("anyOf"):
        return [x.get("type") for x in spec["anyOf"]]
    return t if isinstance(t, list) else [t]


def _abs(key: str, value: object) -> object:
    if key not in PATH_KEYS or not isinstance(value, str) or not value or value.startswith(("~", "/", "\\")) or (len(value) > 1 and value[1] == ":"):
        return value
    base = Path(os.environ.get("FORMENCODER_CWD") or os.getcwd())
    return str((base / value).resolve())


def _coerce(value: str, spec: dict) -> object:
    types = _types(spec)
    if value.lstrip().startswith(("{", "[")):
        try:
            return json.loads(value)
        except ValueError:
            pass
    if "boolean" in types and value.lower() in ("true", "false", "yes", "no", "on", "off", "1", "0"):
        return value.lower() in ("true", "yes", "on", "1")
    for kind, cast in (("integer", int), ("number", float)):
        if kind in types:
            try:
                return cast(value)
            except ValueError:
                pass
    if types == ["object"]:
        return _load(value)
    return value


def _command_help(cid: str, row: dict) -> str:
    schema = row.get("schema") or {}
    props, required = schema.get("properties") or {}, set(schema.get("required") or [])
    where = f" ({row['menu']} menu)" if row.get("menu") else ""
    lines = [f"./formencoder {cid} · {row.get('label', cid)}{where}"]
    if row.get("doc"):
        lines.append(row["doc"])
    for key, spec in props.items():
        kind = "|".join(str(t) for t in _types(spec) if t) or "value"
        if spec.get("enum"):
            kind = "|".join(str(x) for x in spec["enum"])
        lines.append(f"  --{key} {kind.upper() if not spec.get('enum') else kind}{' (required)' if key in required else ''}{'  ' + spec['description'] if spec.get('description') else ''}")
    if not props:
        lines.append("  no parameters")
    kind = "query" if row.get("query") else ("undoable" if row.get("undoable") else "not undoable")
    lines.append(f"MCP tool: {row.get('mcpName', '')} · {kind}. Arrays take the flag once per value or a JSON list; objects take JSON or a JSON file; --json prints the result on one line.")
    return "\n".join(lines)


def _command(cid: str, rest: list[str]) -> int:
    try:
        row = client.rpc("command.describe", {"command": cid})
    except RuntimeError as exc:
        print(f"[formencoder] {exc}", file=sys.stderr)
        return 1
    if "--help" in rest or "-h" in rest:
        print(_command_help(cid, row))
        return 0
    schema = row.get("schema") or {}
    props = schema.get("properties") or {}
    params: dict = {}
    compact = False
    i = 0
    while i < len(rest):
        a = rest[i]
        i += 1
        if a == "--json":
            compact = True
            continue
        if not a.startswith("--"):
            print(f"[formencoder] {cid}: unexpected {a!r}; parameters are --name value (see ./formencoder {cid} --help)", file=sys.stderr)
            return 2
        key, eq, val = a[2:].partition("=")
        if key not in props:
            print(f"[formencoder] {cid} has no parameter {key!r}; it takes {', '.join(props) or 'none'}", file=sys.stderr)
            return 2
        types = _types(props[key])
        if not eq:
            if i < len(rest) and not rest[i].startswith("--"):
                val = rest[i]
                i += 1
            elif "boolean" in types:
                val = "true"
            else:
                print(f"[formencoder] {cid}: --{key} needs a value", file=sys.stderr)
                return 2
        v = _coerce(val, props[key])
        if "array" in types and not isinstance(v, list):
            params.setdefault(key, []).append(_abs(key, v))
        else:
            params[key] = [_abs(key, x) for x in v] if isinstance(v, list) else _abs(key, v)
    missing = [k for k in schema.get("required") or [] if k not in params]
    if missing:
        print(f"[formencoder] {cid} needs --{' --'.join(missing)} (see ./formencoder {cid} --help)", file=sys.stderr)
        return 2
    try:
        result = client.rpc("command.execute", {"command": cid, "params": params})
    except RuntimeError as exc:
        print(f"[formencoder] {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False) if compact else json.dumps(result, indent=2, ensure_ascii=False))
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == "mcp":
        from . import stdio

        stdio.main()
        return 0
    if argv and "." in argv[0] and not argv[0].startswith((".", "/", "~", "-")) and "/" not in argv[0] and "\\" not in argv[0]:
        return _command(argv[0], argv[1:])
    ap = argparse.ArgumentParser(prog="formencoder", description="Drive the running formencoder from the command line.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("exec", help="run one command")
    e.add_argument("id")
    e.add_argument("params", nargs="?")
    b = sub.add_parser("batch", help="run several commands as one undo step")
    b.add_argument("steps", help="JSON list of {command, params}, or a file")
    b.add_argument("--label")
    c = sub.add_parser("commands", help="list commands")
    c.add_argument("filter", nargs="?")
    d = sub.add_parser("describe", help="one command with its schema")
    d.add_argument("id")
    sub.add_parser("queue", help="the queue with every output's status")
    p = sub.add_parser("presets", help="search presets")
    p.add_argument("query", nargs="?")
    enc = sub.add_parser("encode", help="queue files with a preset, encode them and wait")
    enc.add_argument("paths", nargs="+")
    enc.add_argument("--preset", default="system/match-source-high")
    enc.add_argument("--folder")
    w = sub.add_parser("wait", help="wait until the queue is idle")
    w.add_argument("--timeout", type=float, default=3600)
    f = sub.add_parser("frame", help="save a preview frame of an output (or a file) as PNG")
    f.add_argument("out")
    f.add_argument("--output", help="output id or #n (the nth item's first output)")
    f.add_argument("--path", help="a media file instead of a queue output")
    f.add_argument("--preset")
    f.add_argument("--time", type=float, default=0.0)
    f.add_argument("--width", type=int, default=960)
    f.add_argument("--count", type=int, default=0, help="a contact sheet of this many frames")
    pr = sub.add_parser("probe", help="media information of a file")
    pr.add_argument("path")
    a = ap.parse_args(argv)
    try:
        if a.cmd == "exec":
            _print(client.rpc("command.execute", {"command": a.id, "params": _load(a.params)}))
        elif a.cmd == "batch":
            steps = _load(a.steps)
            params = {"steps": steps} if isinstance(steps, list) else steps
            if a.label:
                params["label"] = a.label
            _print(client.rpc("command.batch", params))
        elif a.cmd == "commands":
            rows = client.rpc("command.list", {"filter": a.filter} if a.filter else {})
            for row in rows:
                print(f"{row['id']:<26} {row.get('mcpName') or '':<28} {row['label']:<32} {row.get('params') or ''}")
            print(f"{len(rows)} commands", file=sys.stderr)
        elif a.cmd == "describe":
            _print(client.rpc("command.describe", {"command": a.id}))
        elif a.cmd == "queue":
            _queue_line(client.rpc("ui.state"))
        elif a.cmd == "presets":
            out = client.rpc("command.execute", {"command": "preset.list", "params": {"query": a.query} if a.query else {}})
            for row in out.get("presets", []):
                print(f"{row['id']:<44} {row.get('format', ''):<12} {row.get('name', '')}")
        elif a.cmd == "encode":
            params = {"paths": [str(Path(x).expanduser().resolve()) for x in a.paths], "preset": a.preset, "start": True}
            if a.folder:
                params["folder"] = str(Path(a.folder).expanduser().resolve())
            added = client.rpc("command.execute", {"command": "queue.addSource", "params": params})
            outs = [o for row in added["added"] for o in row["outputs"]]
            done = client.rpc("encode.wait", {"outputs": outs, "timeout": 86400})
            _print(done)
            return 0 if all(o["status"] == "done" for o in done["outputs"]) else 1
        elif a.cmd == "wait":
            _print(client.rpc("encode.wait", {"timeout": a.timeout}))
        elif a.cmd == "frame":
            params: dict = {"time": a.time, "width": a.width}
            if a.count:
                params["count"] = a.count
            if a.path:
                params["path"] = str(Path(a.path).expanduser().resolve())
                if a.preset:
                    params["preset"] = a.preset
            else:
                params["output"] = a.output or "#1"
            out = client.rpc("frame.png", params)
            Path(a.out).write_bytes(base64.b64decode(out["png"]))
            print(f"{a.out} · {out.get('frames', 1)} frame(s)")
        elif a.cmd == "probe":
            _print(client.rpc("command.execute", {"command": "media.probe", "params": {"path": str(Path(a.path).expanduser().resolve())}}))
    except RuntimeError as exc:
        print(f"[formencoder] {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
