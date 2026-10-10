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
    "kvazaar": {
        "repo": "https://github.com/ultravideo/kvazaar.git",
        "tag": "v2.3.2",
        "commit": "6040962bed5cc68c5ad01234c38c08b8b2822068",
        "licence": "BSD-3-Clause",
        "licence_file": "LICENSE",
        "programs": {"kvazaar": "src"},
        "targets": ["kvazaar-bin"],
        "cmake": ["-DBUILD_SHARED_LIBS=OFF", "-DBUILD_TESTS=OFF"],
    },
    "c2patool": {
        "crate": "c2patool",
        "tag": "0.27.22",
        "licence": "MIT-OR-Apache-2.0",
        "programs": {"c2patool": "bin"},
    },
    "whisper": {
        "repo": "https://github.com/ggml-org/whisper.cpp.git",
        "tag": "v1.9.5",
        "commit": "d1be6fde11ac6e0407606b4e42fe72d34add8037",
        "licence": "MIT",
        "licence_file": "LICENSE",
        "programs": {"whisper-cli": "bin"},
        "targets": ["whisper-cli"],
        "cmake": ["-DBUILD_SHARED_LIBS=OFF", "-DWHISPER_BUILD_TESTS=OFF", "-DWHISPER_BUILD_SERVER=OFF", "-DGGML_NATIVE=OFF", "-DWHISPER_SDL2=OFF"],
    },
    "lame": {
        "tarball": "https://downloads.sourceforge.net/project/lame/lame/3.100/lame-3.100.tar.gz",
        "sha256": "ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e",
        "tag": "3.100",
        "licence": "LGPL-2.0-or-later",
        "licence_file": "COPYING",
        "programs": {"lame": "frontend"},
    },
    "openh264": {"download": True, "tag": "2.6.0", "licence": "BSD-2-Clause, Cisco binary licence"},
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


def fetch_tarball(name: str, spec: dict, work: Path) -> Path:
    import hashlib
    import tarfile
    import urllib.request

    archive = work / f"{name}-{spec['tag']}.tar.gz"
    if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest() != spec["sha256"]:
        print(f"[install-tools] downloading {spec['tarball']}", flush=True)
        urllib.request.urlretrieve(spec["tarball"], archive)
    got = hashlib.sha256(archive.read_bytes()).hexdigest()
    if got != spec["sha256"]:
        raise SystemExit(f"[install-tools] {archive.name} has SHA-256 {got}, not the pinned {spec['sha256']}; refusing to build it")
    src = work / f"{name}-{spec['tag']}"
    if src.exists():
        shutil.rmtree(src)
    with tarfile.open(archive) as tar:
        try:
            tar.extractall(work, filter="data")
        except TypeError:
            tar.extractall(work)
    return src


def build_autotools(spec: dict, src: Path) -> Path:
    if os.name == "nt":
        run(["nmake", "-f", "Makefile.MSVC", "comp=msvc", "asm=no"], cwd=src)
        return src / "output"
    run(["./configure", "--disable-shared", "--enable-static", "--disable-gtktest", "--disable-decoder"], cwd=src)
    run(["make", f"-j{os.cpu_count() or 2}"], cwd=src)
    return src


def fetch(name: str, spec: dict, work: Path) -> Path:
    if "tarball" in spec:
        return fetch_tarball(name, spec, work)
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
    if "cmake" not in spec:
        return build_autotools(spec, src)
    out = src / "build-formencoder"
    out.mkdir(exist_ok=True)
    run(["cmake", "-S", str(src), "-B", str(out), "-DCMAKE_BUILD_TYPE=Release", *spec["cmake"]])
    targets: list[str] = []
    for program in spec.get("targets") or spec["programs"]:
        targets += ["--target", program]
    run(["cmake", "--build", str(out), "--config", "Release", "--parallel", str(os.cpu_count() or 2), *targets])
    return out


def locate(out: Path, folder: str, program: str) -> Path:
    exe = program + (".exe" if os.name == "nt" else "")
    src = out.parent if out.name == "build-formencoder" else out
    for candidate in (out / folder / exe, out / folder / "Release" / exe, out / "bin" / exe, out / "bin" / "Release" / exe, src / folder / exe, src / folder / "Release" / exe, out / exe):
        if candidate.is_file():
            return candidate
    for found in out.rglob(exe):
        if found.is_file():
            return found
    raise SystemExit(f"[install-tools] {program} was not built")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the separate tools formencoder drives (bmx, asdcplib, OpenJPEG, Kvazaar, LAME) from their pinned sources and install the programs, or download OpenH264 from Cisco.")
    parser.add_argument("tools", nargs="*", help=f"which tools (default all): {', '.join(TOOLS)}")
    parser.add_argument("--stage", action="store_true", help="install into src-tauri/tools for the desktop bundle instead of the per-person tools folder")
    parser.add_argument("--work", default=str(ROOT / "build" / "tools-src"), help="where the sources are cloned and built")
    parser.add_argument("--keep-going", action="store_true", help="install what builds and report the rest instead of stopping at the first failure")
    parser.add_argument("--model", action="append", default=[], help="download a whisper.cpp speech model (tiny, base, small, medium, large-v3-turbo, or the .en variants) into the per-person models folder; repeatable")
    args = parser.parse_args()
    if args.model:
        sys.path.insert(0, str(ROOT / "backend"))
        from app import model_fetch

        for m in args.model:
            got = model_fetch.fetch(m, lambda p, msg: print(f"[install-tools] {msg}", flush=True) if p in (0.0, 1.0) else None)
            print(f"[install-tools] speech model {m} -> {got['path']}")
        if not args.tools:
            return 0
    names = args.tools or list(TOOLS)
    unknown = [n for n in names if n not in TOOLS]
    if unknown:
        parser.error(f"unknown tool {', '.join(unknown)}; choose from {', '.join(TOOLS)}")
    needs = set()
    for n in names:
        if "repo" in TOOLS[n]:
            needs |= {"git", "cmake"}
        if "crate" in TOOLS[n]:
            needs.add("cargo")
    for need in sorted(needs):
        if not shutil.which(need):
            raise SystemExit(f"[install-tools] {need} is needed to build the tools; install it and run this again")
    dest = ROOT / "src-tauri" / "tools" if args.stage else platform_data() / "tools" / "bin"
    dest.mkdir(parents=True, exist_ok=True)
    notices = dest / "licences"
    notices.mkdir(exist_ok=True)
    work = Path(args.work)
    work.mkdir(parents=True, exist_ok=True)
    failed: list[str] = []
    for name in names:
        try:
            install(name, TOOLS[name], dest, notices, work, args.stage)
        except (SystemExit, subprocess.CalledProcessError, OSError, ValueError) as error:
            if not args.keep_going:
                raise
            failed.append(name)
            print(f"::warning::[install-tools] {name} was not installed: {error}", flush=True)
    print(f"[install-tools] done on {platform.system()} {platform.machine()}; formencoder finds them in {dest}" + (f"; not installed: {', '.join(failed)}" if failed else ""))
    return 0


def install(name: str, spec: dict, dest: Path, notices: Path, work: Path, stage: bool) -> None:
    if spec.get("download"):
        if stage:
            print("[install-tools] OpenH264 is never bundled: Cisco's patent licence covers the binary when each person downloads it from Cisco, so the app downloads it on request (Preferences > Delivery Tools)")
            return
        sys.path.insert(0, str(ROOT / "backend"))
        from app import openh264_fetch

        got = openh264_fetch.fetch(lambda p, m: print(f"[install-tools] {m}", flush=True), dest)
        print(f"[install-tools] {got['attribution']} -> {got['path']}")
        return
    if "crate" in spec:
        root = work / f"{spec['crate']}-{spec['tag']}"
        run(["cargo", "install", "--locked", f"{spec['crate']}@{spec['tag']}", "--root", str(root)])
        exe = spec["crate"] + (".exe" if os.name == "nt" else "")
        shutil.copy2(root / "bin" / exe, dest / exe)
        (notices / f"{name}-{spec['licence']}.txt").write_text(f"{spec['crate']} {spec['tag']} from crates.io, built with cargo install --locked.\nLicensed under the MIT License or the Apache License 2.0, at your option: https://github.com/contentauth/c2pa-rs\n", encoding="utf-8")
        print(f"[install-tools] {spec['crate']} -> {dest / exe}")
        return
    src = fetch(name, spec, work)
    out = build(name, spec, src)
    for program, folder in spec["programs"].items():
        built = locate(out, folder, program)
        target = dest / built.name
        shutil.copy2(built, target)
        print(f"[install-tools] {program} -> {target}")
    shutil.copy2(src / spec["licence_file"], notices / f"{name}-{spec['licence']}.txt")


if __name__ == "__main__":
    raise SystemExit(main())
