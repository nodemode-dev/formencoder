import asyncio
import json
import os
import re
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response

from .. import native
from ..agent import workspace
from ..core import config
from ..engine import rpc
from ..engine.host import host

router = APIRouter(tags=["files"])
_SAFE = re.compile(r"[^A-Za-z0-9._ -]+")


def _resolve(raw: str | None) -> Path:
    if not raw:
        return Path.home()
    p = Path(os.path.expanduser(raw))
    if not p.is_absolute():
        raise HTTPException(400, "paths must be absolute")
    return p


@router.get("/api/fs/roots")
def roots() -> dict:
    data = config.data_dir()
    ws = workspace.ensure()
    places = [
        {"name": "Home", "path": str(Path.home())},
        {"name": "formencoder", "path": str(data)},
        {"name": "Renders", "path": str(ws / "renders")},
        {"name": "Agent workspace", "path": str(ws)},
    ]
    for name in ("Desktop", "Documents", "Downloads", "Movies", "Videos", "Pictures", "Music"):
        p = Path.home() / name
        if p.is_dir():
            places.append({"name": name, "path": str(p)})
    if os.name == "nt":
        for letter in "CDEFGHIJ":
            if Path(f"{letter}:\\").exists():
                places.append({"name": f"{letter}:", "path": f"{letter}:\\"})
    else:
        for base in ("/Volumes", "/media", "/mnt"):
            b = Path(base)
            if b.is_dir():
                for v in sorted(b.iterdir()):
                    if v.is_dir() and not v.name.startswith("."):
                        places.append({"name": v.name, "path": str(v), "volume": True})
    return {"places": places, "home": str(Path.home()), "sep": os.sep}


@router.post("/api/fs/mkdir")
async def mkdir(request: Request) -> dict:
    body = await request.json()
    p = _resolve(body.get("path"))
    p.mkdir(parents=True, exist_ok=True)
    return {"path": str(p)}


@router.post("/api/fs/upload")
async def upload(files: list[UploadFile]) -> dict:
    dest = config.sub("imports")
    paths = []
    for f in files:
        name = _SAFE.sub("_", Path(f.filename or "file").name) or "file"
        target = dest / name
        stem, suffix, n = target.stem, target.suffix, 1
        while target.exists():
            target = dest / f"{stem} {n}{suffix}"
            n += 1
        with target.open("wb") as out:
            shutil.copyfileobj(f.file, out)
        paths.append(str(target))
    return {"paths": paths}


@router.get("/api/fs/file")
def file(path: str) -> FileResponse:
    p = _resolve(path)
    if not p.is_file():
        raise HTTPException(404, f"no file at {p}")
    return FileResponse(p, filename=p.name)


@router.get("/api/fs/thumb")
async def thumb(path: str, at: float = 0.0, width: int = 240, rate: float | None = None) -> Response:
    p = _resolve(path)
    if not p.exists() and "%0" not in str(p):
        raise HTTPException(404, f"no file at {p}")
    width = max(32, min(1920, width))
    data = await asyncio.get_running_loop().run_in_executor(host.previews, lambda: native.module().thumbnail(str(p), at, width, rate))
    if not data:
        raise HTTPException(415, "no picture in that file")
    return Response(bytes(data), media_type="image/png", headers={"cache-control": "private, max-age=60"})


@router.get("/api/preview.png")
async def preview(request: Request) -> Response:
    q = request.query_params
    params: dict = {}
    for key in ("output", "path", "preset", "view"):
        if q.get(key):
            params[key] = q[key]
    for key in ("time", "width", "count", "columns"):
        if q.get(key):
            try:
                params[key] = float(q[key]) if key == "time" else int(q[key])
            except ValueError:
                raise HTTPException(400, f"{key} is a number") from None
    if q.get("patch"):
        try:
            params["patch"] = json.loads(q["patch"])
        except ValueError:
            raise HTTPException(400, "patch is JSON") from None
    try:
        png, meta = await rpc.preview(params)
    except rpc.RpcError as exc:
        return Response(json.dumps({"error": str(exc)}), media_type="application/json", status_code=422)
    return Response(png, media_type="image/png", headers={"x-formencoder-preview": json.dumps(meta, separators=(",", ":"))[:7000], "cache-control": "no-store"})
