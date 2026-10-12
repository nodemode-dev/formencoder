#!/usr/bin/env python3
"""./formencoder counts [--write | --check]: lines of code by area, as the README's Code size table.

  (no flag)  print the table
  --write    replace the table under the README's "## Code size" heading
  --check    exit 1 when the README's table is out of date
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AREAS = [
    ("Encoding engine (Rust, fencoder crates)", ["native"], (".rs",)),
    ("Engine service (Python)", ["backend/app", "backend/formencoder_engine.py"], (".py",)),
    ("Interface (TypeScript)", ["frontend/src"], (".ts",)),
    ("Interface styles (CSS)", ["frontend/src/styles"], (".css",)),
    ("Desktop shell (Rust, Tauri)", ["src-tauri/src"], (".rs",)),
    ("Setup and CLI", ["setup", "formencoder", "formencoder.bat"], ("", ".py", ".bat", ".sh")),
    ("Agent skills (Markdown, hand-written)", [".claude/skills/formencoder-harness", ".claude/skills/formencoder-skillset"], (".md",)),
]
GENERATED = {"commands.md", "tools.md", "presets.md", "formats.md"}
HEADING = "## Code size"


def tracked() -> list[Path]:
    try:
        out = subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True)
        return [ROOT / p for p in out.splitlines()]
    except (OSError, subprocess.CalledProcessError):
        return [p for p in ROOT.rglob("*") if p.is_file() and ".git" not in p.parts]


def count(files: list[Path]) -> list[tuple[str, int, int]]:
    rows = []
    for name, roots, exts in AREAS:
        bases = [ROOT / r for r in roots]
        n_files = n_lines = 0
        for f in files:
            if f.name in GENERATED or not f.is_file():
                continue
            if not any(f == b or b in f.parents for b in bases):
                continue
            if f.suffix not in exts:
                continue
            try:
                lines = sum(1 for line in f.read_text(encoding="utf-8").splitlines() if line.strip())
            except (UnicodeDecodeError, OSError):
                continue
            n_files += 1
            n_lines += lines
        rows.append((name, n_files, n_lines))
    return rows


def table(rows: list[tuple[str, int, int]]) -> str:
    out = ["| Area | Files | Lines |", "| --- | ---: | ---: |"]
    out += [f"| {n} | {f} | {l:,} |" for n, f, l in rows]
    out.append(f"| Total | {sum(r[1] for r in rows)} | {sum(r[2] for r in rows):,} |")
    return "\n".join(out)


def readme_with(text: str, new_table: str) -> str | None:
    start = text.find(HEADING)
    if start < 0:
        return None
    body = text.index("\n", start) + 1
    end = text.find("\n## ", body)
    end = len(text) if end < 0 else end + 1
    return text[:body] + "\n" + new_table + "\n\nNon-blank lines in tracked files; generated skill references excluded. `./formencoder counts` prints this table.\n" + ("\n" if end < len(text) else "") + text[end:]


def main(argv: list[str]) -> int:
    t = table(count(tracked()))
    if not argv:
        print(t)
        return 0
    readme = ROOT / "README.md"
    text = readme.read_text(encoding="utf-8")
    want = readme_with(text, t)
    if want is None:
        print(f"counts: README.md has no {HEADING} section")
        return 1
    if argv[0] == "--check":
        ok = want == text
        print("counts: README in step" if ok else "counts: README table is out of date (run ./formencoder counts --write)")
        return 0 if ok else 1
    if argv[0] == "--write":
        if want != text:
            readme.write_text(want, encoding="utf-8")
        print(t)
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
