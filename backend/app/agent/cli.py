from __future__ import annotations

import argparse
import base64
import json
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


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == "mcp":
        from . import stdio

        stdio.main()
        return 0
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
