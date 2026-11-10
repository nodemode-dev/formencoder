"""python -m app.functions run ID --inputs JSON --params JSON --out DIR | manifest [--write | --check]

run       call one function and print its result as one JSON line (exit 1 with {"error"} on failure)
manifest  print form-functions.json as the engine builds it; --write saves it, --check exits 1 when it drifted
"""

from __future__ import annotations

import argparse
import json
import sys

from . import FUNCTIONS, FunctionError, ParamsError


def _json(text: str, flag: str) -> dict:
    try:
        value = json.loads(text)
    except ValueError as exc:
        raise SystemExit(f"[formencoder] {flag} is not JSON: {exc}") from None
    if not isinstance(value, dict):
        raise SystemExit(f"[formencoder] {flag} must be a JSON object")
    return value


def _run(a: argparse.Namespace) -> int:
    fn = FUNCTIONS.get(a.id)
    if fn is None:
        print(json.dumps({"error": f"no function {a.id!r}; there are {', '.join(FUNCTIONS)}"}))
        return 2
    try:
        result = fn(_json(a.inputs, "--inputs"), _json(a.params, "--params"), a.out)
    except (FunctionError, ParamsError) as exc:
        print(json.dumps({"error": str(exc)}))
        return 1
    print(json.dumps(result))
    return 0


def _manifest(a: argparse.Namespace) -> int:
    from . import manifest

    text = manifest.render(manifest.build())
    if a.write:
        manifest.PATH.write_text(text, encoding="utf-8")
        print(f"[formencoder] wrote {manifest.PATH}")
        return 0
    if a.check:
        current = manifest.PATH.read_text(encoding="utf-8") if manifest.PATH.is_file() else ""
        if current != text:
            print(f"[formencoder] {manifest.PATH.name} is out of date; run python -m app.functions manifest --write", file=sys.stderr)
            return 1
        print(f"[formencoder] {manifest.PATH.name}: in step")
        return 0
    sys.stdout.write(text)
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m app.functions", description="formencoder's Form functions from a shell.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    run = sub.add_parser("run", help="run one function")
    run.add_argument("id")
    run.add_argument("--inputs", required=True, help='input name -> file path, e.g. {"media": "clip.mp4"}')
    run.add_argument("--params", default="{}", help='e.g. {"preset": "system/match-source-medium"}')
    run.add_argument("--out", required=True, help="the folder outputs are written into")
    man = sub.add_parser("manifest", help="build form-functions.json from the engine")
    mode = man.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    a = ap.parse_args(argv)
    return _run(a) if a.cmd == "run" else _manifest(a)


if __name__ == "__main__":
    raise SystemExit(main())
