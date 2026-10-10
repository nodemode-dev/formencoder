#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

TOOLS = {
    "bmx": {
        "repo": "https://github.com/bbc/bmx.git",
        "tag": "v1.6",
        "commit": "feb6e3dc95b9a1f31c8aa555cf54301643dbe670",
        "licence": "BSD-3-Clause",
        "licence_file": "COPYING",
        "programs": {"bmxtranswrap": "apps/bmxtranswrap", "mxf2raw": "apps/mxf2raw"},
        "cmake": ["-DBMX_BUILD_URIPARSER_SOURCE=ON", "-DBMX_BUILD_EXPAT_SOURCE=ON", "-DBMX_BUILD_TESTING=OFF", "-DBMX_BUILD_WITH_LIBCURL=OFF", "-DBUILD_SHARED_LIBS=OFF"],
    },
    "asdcplib": {
        "repo": "https://github.com/cinecert/asdcplib.git",
        "tag": "rel_2_13_2",
        "commit": "d53aac87d1e52d71bbc47631911e75e01e6ad328",
        "licence": "BSD-3-Clause",
        "licence_file": "COPYING",
        "programs": {"asdcp-wrap": "src", "asdcp-info": "src"},
        "cmake": ["-DWITHOUT_SSL=ON", "-DWITHOUT_XML=ON", "-DBUILD_SHARED_LIBS=OFF"],
    },
    "openjpeg": {
        "repo": "https://github.com/uclouvain/openjpeg.git",
        "tag": "v2.5.3",
        "commit": "210a8a5690d0da66f02d49420d7176a21ef409dc",
        "licence": "BSD-2-Clause",
        "licence_file": "LICENSE",
        "programs": {"opj_compress": "bin"},
        "cmake": ["-DBUILD_SHARED_LIBS=OFF", "-DBUILD_CODEC=ON", "-DBUILD_THIRDPARTY=ON"],
    },
}


def platform_data() -> Path:
    home = Path.home()
    if sys.platform == "darwin":
        return home / "Library" / "Application Support" / "formencoder"
    if os.name == "nt":
        return Path(os.environ.get("LOCALAPPDATA", home / "AppData" / "Local")) / "formencoder"
    return Path(os.environ.get("XDG_DATA_HOME", home / ".local" / "share")) / "formencoder"


def run(cmd: list[str], cwd: Path | None = None) -> None:
    print("[install-tools] " + " ".join(cmd), flush=True)
    subprocess.run(cmd, cwd=cwd, check=True)


def fetch(name: str, spec: dict, work: Path) -> Path:
    src = work / name
    if not (src / ".git").is_dir():
        if src.exists():
            shutil.rmtree(src)
        run(["git", "clone", "--depth", "1", "--branch", spec["tag"], spec["repo"], str(src)])
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=src, check=True, capture_output=True, text=True).stdout.strip()
    if head != spec["commit"]:
        raise SystemExit(f"[install-tools] {name} {spec['tag']} is at {head}, not the pinned {spec['commit']}; refusing to build it")
    return src


def build(name: str, spec: dict, src: Path) -> Path:
    out = src / "build-formencoder"
    out.mkdir(exist_ok=True)
    run(["cmake", "-S", str(src), "-B", str(out), "-DCMAKE_BUILD_TYPE=Release", *spec["cmake"]])
    targets: list[str] = []
    for program in spec["programs"]:
        targets += ["--target", program]
    run(["cmake", "--build", str(out), "--config", "Release", "--parallel", str(os.cpu_count() or 2), *targets])
    return out


def locate(out: Path, folder: str, program: str) -> Path:
    exe = program + (".exe" if os.name == "nt" else "")
    for candidate in (out / folder / exe, out / folder / "Release" / exe, out / "bin" / exe, out / "bin" / "Release" / exe):
        if candidate.is_file():
            return candidate
    for found in out.rglob(exe):
        if found.is_file():
            return found
    raise SystemExit(f"[install-tools] {program} was not built")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the separate delivery tools formencoder drives (bmx, asdcplib, OpenJPEG) from their pinned source tags and install the programs.")
    parser.add_argument("tools", nargs="*", help=f"which tools (default all): {', '.join(TOOLS)}")
    parser.add_argument("--stage", action="store_true", help="install into src-tauri/tools for the desktop bundle instead of the per-person tools folder")
    parser.add_argument("--work", default=str(ROOT / "build" / "tools-src"), help="where the sources are cloned and built")
    args = parser.parse_args()
    names = args.tools or list(TOOLS)
    unknown = [n for n in names if n not in TOOLS]
    if unknown:
        parser.error(f"unknown tool {', '.join(unknown)}; choose from {', '.join(TOOLS)}")
    for need in ("git", "cmake"):
        if not shutil.which(need):
            raise SystemExit(f"[install-tools] {need} is needed to build the tools; install it and run this again")
    dest = ROOT / "src-tauri" / "tools" if args.stage else platform_data() / "tools" / "bin"
    dest.mkdir(parents=True, exist_ok=True)
    notices = dest / "licences"
    notices.mkdir(exist_ok=True)
    work = Path(args.work)
    work.mkdir(parents=True, exist_ok=True)
    for name in names:
        spec = TOOLS[name]
        src = fetch(name, spec, work)
        out = build(name, spec, src)
        for program, folder in spec["programs"].items():
            built = locate(out, folder, program)
            target = dest / built.name
            shutil.copy2(built, target)
            print(f"[install-tools] {program} -> {target}")
        shutil.copy2(src / spec["licence_file"], notices / f"{name}-{spec['licence']}.txt")
    print(f"[install-tools] done on {platform.system()} {platform.machine()}; formencoder finds them in {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
