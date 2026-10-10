import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import __version__
from .agent import workspace
from .core import config, discovery
from .core.security import LocalOnly
from .engine import rpc as engine_rpc
from .engine.host import host
from .routers import agents, files, live, mcp, rpc, system, terminal

ROUTERS = (system.router, rpc.router, live.router, files.router, terminal.router, mcp.router, agents.router)


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, host.start, loop)
    await loop.run_in_executor(None, engine_rpc.query_ids)
    try:
        workspace.ensure()
    except OSError:
        pass
    opening = [p for p in os.environ.get("FORMENCODER_OPEN", "").split(os.pathsep) if p.strip()]
    if opening and host.available:
        try:
            await engine_rpc.execute("queue.addSource", {"paths": opening}, "desktop")
        except Exception:
            pass
    if not config.DESKTOP:
        try:
            discovery.publish(f"http://127.0.0.1:{config.PORT}", __version__)
        except OSError:
            pass
    yield
    host.stop()
    discovery.withdraw()


app = FastAPI(title="formencoder engine", version=__version__, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.cors_origins(), allow_credentials=False, allow_methods=["*"], allow_headers=["*"], expose_headers=["x-formencoder-preview"])
app.add_middleware(LocalOnly)
for r in ROUTERS:
    app.include_router(r)

_dist = config.dist_dir()
if _dist:
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="interface")
