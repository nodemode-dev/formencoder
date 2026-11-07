import asyncio

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response

from ..services import extensions

router = APIRouter(tags=["extensions"])


@router.get("/api/extensions")
def listing(reload: bool = False) -> dict:
    return extensions.listing(reload)


@router.get("/api/extensions/stamp")
def stamp() -> dict:
    return {"stamp": extensions.stamp()}


@router.api_route("/api/extensions/files/{ext_id}/{version}/{path:path}", methods=["GET", "HEAD"])
def files(ext_id: str, version: str, path: str) -> Response:
    found = extensions.file_for(ext_id, version, path)
    if found is None:
        return Response(status_code=404, headers=extensions.headers_for("text/plain"))
    target, content_type = found
    return FileResponse(target, media_type=content_type, headers=extensions.headers_for(content_type))


@router.post("/api/extensions/save")
async def save(request: Request) -> dict:
    body = await request.json()
    try:
        return await asyncio.get_running_loop().run_in_executor(None, extensions.save, str(body.get("path") or ""), str(body.get("data") or ""), bool(body.get("overwrite")))
    except FileExistsError:
        raise HTTPException(409, "a file with that name is there already") from None
    except (ValueError, OSError) as exc:
        raise HTTPException(400, str(exc)) from None


@router.post("/api/extensions/fetch")
async def fetch(request: Request) -> dict:
    body = await request.json()
    try:
        return await asyncio.get_running_loop().run_in_executor(None, lambda: extensions.fetch(str(body.get("url") or ""), str(body.get("method") or "GET"), body.get("headers") or {}, body.get("body")))
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from None
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None
