#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FOLDERS = ("tools", "ffmpeg")
MACHO = {
    b"\xfe\xed\xfa\xce",
    b"\xce\xfa\xed\xfe",
    b"\xfe\xed\xfa\xcf",
    b"\xcf\xfa\xed\xfe",
    b"\xca\xfe\xba\xbe",
    b"\xbe\xba\xfe\xca",
}


def is_macho(path: Path) -> bool:
    try:
        with path.open("rb") as handle:
            return handle.read(4) in MACHO
    except OSError:
        return False


def found(base: Path) -> list[Path]:
    files: list[Path] = []
    for folder in FOLDERS:
        root = base / folder
        if not root.is_dir():
            continue
        for path in sorted(root.rglob("*")):
            if path.is_file() and not path.is_symlink() and is_macho(path):
                files.append(path)
    return sorted(files, key=lambda p: (not p.name.endswith((".dylib", ".so")), -len(p.parts), str(p)))


def main() -> int:
    parser = argparse.ArgumentParser(description="Sign every Mach-O program and library staged in src-tauri/tools and src-tauri/ffmpeg with APPLE_SIGNING_IDENTITY, hardened runtime and a secure timestamp, so the notarized app carries no unsigned code in its resources. Does nothing off macOS or without an identity.")
    parser.add_argument("--base", default=str(ROOT / "src-tauri"), help="the folder holding tools/ and ffmpeg/")
    args = parser.parse_args()
    identity = os.environ.get("APPLE_SIGNING_IDENTITY", "").strip()
    if sys.platform != "darwin" or not identity or identity == "-":
        return 0
    files = found(Path(args.base))
    if not files:
        print("[sign-resources] no Mach-O files in tools/ or ffmpeg/", flush=True)
        return 0
    base = ["codesign", "--force", "--options", "runtime", "--timestamp", "--sign", identity]
    keychain = os.environ.get("FORMCOMPILER_KEYCHAIN", "").strip()
    if keychain and Path(keychain).is_file():
        base += ["--keychain", keychain]
    for path in files:
        subprocess.run([*base, str(path)], check=True)
        subprocess.run(["codesign", "--verify", "--strict", str(path)], check=True)
        print(f"[sign-resources] signed {path.relative_to(Path(args.base))}", flush=True)
    print(f"[sign-resources] {len(files)} files signed with hardened runtime", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
