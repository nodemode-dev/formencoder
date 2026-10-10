from __future__ import annotations

import bz2
import hashlib
import os
import platform
import sys
import tempfile
import urllib.request
from pathlib import Path
from typing import Callable

VERSION = "2.6.0"
BASE = "https://ciscobinary.openh264.org"
ATTRIBUTION = "OpenH264 Video Codec provided by Cisco Systems, Inc."

PINS = {
    "x86_64-unknown-linux-gnu": ("libopenh264-2.6.0-linux64.8.so", "27ab53323c110b76214c1c72222f459d17febbcd1e252136cadc292b0308d75b"),
    "aarch64-unknown-linux-gnu": ("libopenh264-2.6.0-linux-arm64.8.so", "a78aea7970150f46bcd3bb7994c9e6dd90bd7a9ea785920f5a73f6964e3fcda7"),
    "aarch64-apple-darwin": ("libopenh264-2.6.0-mac-arm64.dylib", "6db362ee5abdab572311aeadb96d3f44b0617d9a4a4b9f4db4cb5ac4d968da71"),
    "x86_64-apple-darwin": ("libopenh264-2.6.0-mac-x64.dylib", "38b2ed6d1d45b6a3e408c734173f2d67ab44a10d0e154ff3489b89877cd60e7e"),
    "x86_64-pc-windows-msvc": ("openh264-2.6.0-win64.dll", "dab5f2a872777f9a58b69bfa9fbcf20d9f82f2d6ec91383fd70bff49bd34ac9f"),
}

LICENCE_URL = "https://www.openh264.org/BINARY_LICENSE.txt"


def host_triple() -> str:
    arch = "aarch64" if platform.machine().lower() in ("arm64", "aarch64") else "x86_64"
    if sys.platform == "darwin":
        return f"{arch}-apple-darwin"
    if os.name == "nt":
        return f"{arch}-pc-windows-msvc"
    return f"{arch}-unknown-linux-gnu"


def tools_folder() -> Path:
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    elif os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share")
    return base / "formencoder" / "tools" / "bin"


def fetch(report: Callable[[float, str], None] | None = None, folder: Path | None = None) -> dict:
    triple = host_triple()
    if triple not in PINS:
        raise ValueError(f"Cisco publishes no OpenH264 {VERSION} binary for {triple}")
    name, digest = PINS[triple]
    dest = (folder or tools_folder())
    dest.mkdir(parents=True, exist_ok=True)
    target = dest / name
    say = report or (lambda p, m: None)
    url = f"{BASE}/{name}.bz2"
    say(0.05, f"downloading {url}")
    with tempfile.TemporaryDirectory() as scratch:
        archive = Path(scratch) / f"{name}.bz2"
        try:
            urllib.request.urlretrieve(url, archive)
        except OSError as error:
            raise ValueError(f"{url} could not be downloaded: {error}") from None
        got = hashlib.sha256(archive.read_bytes()).hexdigest()
        if got != digest:
            raise ValueError(f"{name}.bz2 from Cisco has SHA-256 {got}, not the pinned {digest}; nothing was installed")
        say(0.8, "unpacking")
        data = bz2.decompress(archive.read_bytes())
        part = target.with_name(target.name + ".part")
        part.write_bytes(data)
        if os.name != "nt":
            part.chmod(0o755)
        os.replace(part, target)
    note = dest / "licences" / "openh264-cisco.txt"
    note.parent.mkdir(exist_ok=True)
    note.write_text(f"{ATTRIBUTION}\n\n{name} was downloaded from {url} (SHA-256 of the archive {digest}).\nCisco's binary licence and patent terms: {LICENCE_URL}\nThe OpenH264 source code is BSD-2-Clause: https://github.com/cisco/openh264\n", encoding="utf-8")
    say(1.0, f"OpenH264 {VERSION} installed")
    return {"path": str(target), "version": VERSION, "attribution": ATTRIBUTION, "folder": str(dest)}


if __name__ == "__main__":
    print(fetch(lambda p, m: print(f"[openh264] {m}", flush=True)))
