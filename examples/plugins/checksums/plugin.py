import hashlib
import json
import sys
from pathlib import Path


def say(**kw):
    print(json.dumps(kw), flush=True)


def digest(path, algorithm):
    h = hashlib.new(algorithm)
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def write_sums(paths, algorithm, folder=""):
    written = []
    for i, p in enumerate(paths):
        src = Path(p)
        if not src.is_file():
            continue
        say(progress=i / max(1, len(paths)), message=f"hashing {src.name}")
        target = (Path(folder) if folder else src.parent) / f"{src.name}.{algorithm}"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(f"{digest(src, algorithm)}  {src.name}\n", encoding="utf-8")
        written.append(str(target))
    return written


def main():
    req = json.loads(sys.stdin.readline() or "{}")
    opts = req.get("options") or {}
    algorithm = opts.get("algorithm") or "sha256"
    if algorithm not in ("sha256", "sha1", "md5"):
        say(error=f"unknown algorithm {algorithm}")
        return
    event = req.get("event")
    if event == "afterEncode":
        files = write_sums(req.get("files") or [], algorithm, opts.get("folder") or "")
        say(result={"files": files, "notes": [f"{len(files)} {algorithm} file(s) written"]})
    elif event == "command":
        params = req.get("params") or {}
        files = write_sums(params.get("paths") or [], algorithm, opts.get("folder") or "")
        say(result={"files": files})
    elif event == "publish":
        folder = Path(opts.get("folder") or Path((req.get("files") or ["."])[0]).parent)
        folder.mkdir(parents=True, exist_ok=True)
        manifest = folder / "formencoder-manifest.json"
        rows = [{"file": f, algorithm: digest(f, algorithm)} for f in req.get("files") or [] if Path(f).is_file()]
        manifest.write_text(json.dumps({"context": req.get("context"), "files": rows}, indent=2), encoding="utf-8")
        say(result={"sent": [str(manifest)]})
    else:
        say(error=f"unknown event {event}")


if __name__ == "__main__":
    main()
