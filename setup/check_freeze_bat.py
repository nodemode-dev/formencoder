"""Check the PyInstaller command line in setup/freeze_backend.bat without Windows.

The command is taken out of the .bat, given stand-in values for its %VARIABLES%,
split the way cmd.exe splits it and parsed with PyInstaller's own argument parser,
with the Windows path separator. It fails when the parser refuses the line, when the
script name is not the engine entry file, or when the parsed options differ from the
POSIX twin setup/freeze_backend (parsed the same way) by more than the Windows-only
extras listed below. Needs PyInstaller (backend/requirements_desktop.txt).
"""

import os
import re
import shlex
import sys

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BAT = os.path.join(ROOT_DIR, "setup", "freeze_backend.bat")
POSIX = os.path.join(ROOT_DIR, "setup", "freeze_backend")
WIN_ROOT = "D:\\a\\formencoder\\formencoder"
POSIX_ROOT = "/standin/formencoder"
ENTRY = "<root>/backend/formencoder_engine.py"
BAT_VARS = {"ROOT": WIN_ROOT, "CONSOLE": "--noconsole"}
WINDOWS_ONLY = {"collect_submodules": ["winpty"]}


def bat_command(text):
    lines = [line for line in text.splitlines() if line.lstrip().lower().startswith("pyinstaller ")]
    if len(lines) != 1:
        raise SystemExit(f"check_freeze_bat: expected one pyinstaller line in {BAT}, found {len(lines)}")
    line = re.sub(r"\s*\|\|\s*exit /b \d+\s*$", "", lines[0].strip(), flags=re.IGNORECASE)
    line = re.sub(r"%(\w+)%", lambda m: BAT_VARS.get(m.group(1).upper(), "standin"), line)
    tokens, current, quoted, started = [], [], False, False
    for ch in line:
        if ch == '"':
            quoted, started = not quoted, True
        elif ch in " \t" and not quoted:
            if started:
                tokens.append("".join(current))
            current, started = [], False
        else:
            current.append(ch)
            started = True
    if quoted:
        raise SystemExit("check_freeze_bat: unbalanced quote in the pyinstaller line")
    if started:
        tokens.append("".join(current))
    return tokens


def posix_command(text):
    lines = text.splitlines()
    start = next(i for i, line in enumerate(lines) if line.lstrip().startswith("pyinstaller "))
    parts = []
    for line in lines[start:]:
        parts.append(line.rstrip().rstrip("\\"))
        if not line.rstrip().endswith("\\"):
            break
    line = " ".join(parts)
    line = line.replace('"${console[@]}"', "--noconsole").replace("${sep}", ":")
    line = line.replace("$FORMENCODER_ROOT", POSIX_ROOT)
    return shlex.split(line)


def parse(tokens, pathsep):
    from PyInstaller.__main__ import generate_parser

    saved = os.pathsep
    os.pathsep = pathsep
    try:
        return vars(generate_parser().parse_args(tokens[1:]))
    except SystemExit:
        return None
    finally:
        os.pathsep = saved


def normal(value, root):
    if isinstance(value, str):
        return value.replace(root, "<root>").replace("\\", "/")
    if isinstance(value, (list, tuple)):
        return [normal(v, root) for v in value]
    return value


def main():
    with open(BAT, encoding="utf-8") as fh:
        bat = parse(bat_command(fh.read()), ";")
    if bat is None:
        print("check_freeze_bat: PyInstaller's parser refuses the command in setup/freeze_backend.bat")
        return 1
    with open(POSIX, encoding="utf-8") as fh:
        posix = parse(posix_command(fh.read()), ":")
    if posix is None:
        print("check_freeze_bat: PyInstaller's parser refuses the command in setup/freeze_backend")
        return 1
    bat = {k: normal(v, WIN_ROOT) for k, v in bat.items()}
    posix = {k: normal(v, POSIX_ROOT) for k, v in posix.items()}
    findings = []
    if bat["filenames"] != [ENTRY]:
        findings.append(f"the .bat's script names are {bat['filenames']}, not [{ENTRY!r}]")
    for key in sorted(set(bat) | set(posix)):
        want = posix.get(key)
        got = bat.get(key)
        if key in WINDOWS_ONLY and isinstance(got, list):
            got = [v for v in got if v not in WINDOWS_ONLY[key]]
        if got != want:
            findings.append(f"{key}: .bat gives {got!r}, setup/freeze_backend gives {want!r}")
    for line in findings:
        print(f"check_freeze_bat: {line}")
    print(f"check_freeze_bat: {len(findings)} finding(s)")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
