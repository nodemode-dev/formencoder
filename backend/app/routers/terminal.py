import asyncio
import contextlib
import json
import os
import shutil
import signal
import struct
import threading
import time

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect

from ..agent import consent, workspace
from ..core import config

router = APIRouter(prefix="/api/terminal", tags=["terminal"])
POSIX = os.name == "posix"
AGENTS = {"claude": "claude", "codex": "codex", "cursor": "cursor-agent"}


def _environment(base_url: str) -> dict:
    ws = workspace.ensure()
    env = dict(os.environ)
    env["FORMENCODER_URL"] = base_url
    env["FORMENCODER_AGENT_TOKEN"] = consent.TOKEN
    env["FORMENCODER_AGENT_NAME"] = "terminal"
    env["FORMENCODER_WORKSPACE"] = str(ws)
    env["PATH"] = str(ws / "bin") + os.pathsep + env.get("PATH", "")
    env["FORMENCODER_BIN"] = str(ws / "bin")
    if POSIX:
        env.update(workspace.shell_command(_shell_path())[1])
    env.setdefault("TERM", "xterm-256color")
    env["COLORTERM"] = "truecolor"
    env.pop("FORMENCODER_DESKTOP", None)
    return env


def _shell_path() -> str:
    return os.environ.get("SHELL") or ("/bin/zsh" if os.path.exists("/bin/zsh") else "/bin/bash")


def _shell() -> list[str]:
    if POSIX:
        return workspace.shell_command(_shell_path())[0]
    return [os.environ.get("COMSPEC", "cmd.exe")]


class Session:
    def __init__(self, cols: int, rows: int, env: dict, cwd: str):
        self.cols, self.rows = max(20, min(500, cols)), max(5, min(300, rows))
        self.pid = None
        self.fd = None
        self.process = None
        self.winpty = None
        if POSIX:
            import pty

            pid, fd = pty.fork()
            if pid == 0:
                try:
                    os.chdir(cwd)
                except OSError:
                    os.chdir(os.path.expanduser("~"))
                os.execvpe(_shell()[0], _shell(), env)
            self.pid, self.fd = pid, fd
            self.resize(self.cols, self.rows)
            return
        try:
            from winpty import PtyProcess

            self.winpty = PtyProcess.spawn(_shell(), cwd=cwd, env=env, dimensions=(self.rows, self.cols))
        except Exception:
            import subprocess

            self.process = subprocess.Popen(_shell(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env, cwd=cwd)

    def resize(self, cols: int, rows: int) -> None:
        self.cols, self.rows = max(20, min(500, cols)), max(5, min(300, rows))
        if POSIX and self.fd is not None:
            import fcntl
            import termios

            fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack("HHHH", self.rows, self.cols, 0, 0))
        elif self.winpty is not None:
            with contextlib.suppress(Exception):
                self.winpty.setwinsize(self.rows, self.cols)

    def write(self, data: str) -> None:
        if POSIX and self.fd is not None:
            os.write(self.fd, data.encode("utf-8"))
        elif self.winpty is not None:
            self.winpty.write(data)
        elif self.process and self.process.stdin:
            self.process.stdin.write(data.replace("\r", "\r\n").encode("utf-8"))
            self.process.stdin.flush()

    def read(self) -> str:
        if POSIX and self.fd is not None:
            return os.read(self.fd, 65536).decode("utf-8", errors="replace")
        if self.winpty is not None:
            return self.winpty.read(65536)
        if self.process and self.process.stdout:
            data = self.process.stdout.read1(65536) if hasattr(self.process.stdout, "read1") else self.process.stdout.readline()
            return data.decode("utf-8", errors="replace")
        return ""

    def close(self) -> None:
        if POSIX and self.pid:
            with contextlib.suppress(OSError):
                os.kill(self.pid, signal.SIGHUP)
            with contextlib.suppress(OSError):
                os.close(self.fd)
            with contextlib.suppress(OSError):
                os.waitpid(self.pid, os.WNOHANG)
        elif self.winpty is not None:
            with contextlib.suppress(Exception):
                self.winpty.terminate(force=True)
        elif self.process:
            self.process.kill()


@router.get("/status")
def status() -> dict:
    ws = workspace.ensure()
    return {
        "available": True,
        "pty": POSIX,
        "shell": _shell()[0],
        "cwd": str(ws),
        "agents": {name: shutil.which(binary) is not None for name, binary in AGENTS.items()},
        "launch": AGENTS,
    }


KEEP = 256_000


class Term:
    def __init__(self, tid: str, title: str, cwd: str, cols: int, rows: int, base: str, owned: bool) -> None:
        self.id, self.title, self.cwd, self.base, self.owned = tid, title, cwd, base, owned
        self.opener = "ui"
        self.created = time.time()
        self.buffer = ""
        self.offset = 0
        self.listeners: set[asyncio.Queue] = set()
        self.loop = asyncio.get_running_loop()
        self.exited = False
        self.session: Session | None = None
        self._start(cols, rows)

    def _start(self, cols: int, rows: int) -> None:
        self.exited = False
        self.session = Session(cols, rows, _environment(self.base), self.cwd)
        session = self.session

        def pump() -> None:
            while True:
                try:
                    data = session.read()
                except (OSError, EOFError):
                    break
                if not data:
                    break
                self.loop.call_soon_threadsafe(self._feed, data)
            self.loop.call_soon_threadsafe(self._ended, session)

        threading.Thread(target=pump, daemon=True).start()

    def _feed(self, data: str) -> None:
        self.buffer = (self.buffer + data)[-KEEP:]
        self.offset += len(data)
        for q in list(self.listeners):
            with contextlib.suppress(asyncio.QueueFull):
                q.put_nowait(data)

    def _ended(self, session: "Session") -> None:
        if session is not self.session:
            return
        self.exited = True
        for q in list(self.listeners):
            with contextlib.suppress(asyncio.QueueFull):
                q.put_nowait(None)
        hub.changed()

    def write(self, data: str) -> None:
        if self.session and not self.exited:
            self.session.write(data)

    def read(self, since: int | None) -> tuple[str, int]:
        start = self.offset - len(self.buffer)
        pos = start if since is None else max(int(since), start)
        return self.buffer[pos - start:], self.offset

    def restart(self) -> None:
        cols, rows = (self.session.cols, self.session.rows) if self.session else (100, 30)
        old, self.session = self.session, None
        if old:
            old.close()
        self._feed("\r\n[formencoder] terminal restarted\r\n")
        self._start(cols, rows)

    def close(self) -> None:
        if self.session:
            self.session.close()
        self.exited = True

    def row(self) -> dict:
        return {"id": self.id, "title": self.title, "cwd": self.cwd, "created": self.created, "exited": self.exited, "owned": self.owned, "offset": self.offset, "opener": self.opener}


class Hub:
    def __init__(self) -> None:
        self.terms: dict[str, Term] = {}
        self._n = 0

    def changed(self) -> None:
        from ..engine.host import host as engine_host

        engine_host.bus.publish({"type": "terminals", "sessions": self.listing()}, ("ui",))

    def listing(self) -> list[dict]:
        return [t.row() for t in self.terms.values() if not t.owned]

    def open(self, title: str | None, cwd: str | None, cols: int, rows: int, base: str, owned: bool = False, run: str | None = None) -> Term:
        self._n += 1
        tid = f"t{self._n}"
        place = cwd or str(workspace.ensure())
        term = Term(tid, title or f"Terminal {self._n}", place, cols, rows, base, owned)
        self.terms[tid] = term
        if run:
            term.write(run + "\r")
        if not owned:
            self.changed()
        return term

    def get(self, tid: str) -> Term:
        term = self.terms.get(tid)
        if term is None:
            raise KeyError(f"no terminal {tid!r}; open terminals: {', '.join(t['id'] for t in self.listing()) or 'none'}")
        return term

    def close(self, tid: str) -> None:
        term = self.terms.pop(tid, None)
        if term:
            term.close()
            if not term.owned:
                self.changed()


hub = Hub()


def _base(host_header: str | None, engine: str | None = None) -> str:
    if engine:
        return engine
    h = host_header or f"127.0.0.1:{config.PORT}"
    return f"http://127.0.0.1:{h.rsplit(':', 1)[-1]}" if ":" in h else f"http://127.0.0.1:{config.PORT}"


@router.get("/sessions")
def sessions() -> dict:
    return {"sessions": hub.listing()}


@router.post("/sessions")
async def open_session(request: Request) -> dict:
    body = await request.json() if (await request.body()) else {}
    launch = body.get("launch")
    run = AGENTS.get(launch) if launch in AGENTS else None
    term = hub.open(body.get("title"), body.get("cwd"), int(body.get("cols") or 100), int(body.get("rows") or 30), _base(request.headers.get("host")), run=run)
    return term.row()


@router.post("/sessions/{tid}/input")
async def session_input(tid: str, request: Request) -> dict:
    body = await request.json()
    try:
        term = hub.get(tid)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from None
    term.write(str(body.get("data") or ""))
    return {"id": tid, "offset": term.offset}


@router.get("/sessions/{tid}/output")
def session_output(tid: str, since: int | None = None) -> dict:
    try:
        text, offset = hub.get(tid).read(since)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from None
    return {"id": tid, "text": text, "offset": offset}


@router.post("/sessions/{tid}/restart")
def session_restart(tid: str) -> dict:
    try:
        term = hub.get(tid)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from None
    term.restart()
    hub.changed()
    return term.row()


@router.post("/sessions/{tid}/rename")
async def session_rename(tid: str, request: Request) -> dict:
    body = await request.json()
    try:
        term = hub.get(tid)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from None
    term.title = str(body.get("title") or term.title)[:80]
    hub.changed()
    return term.row()


@router.delete("/sessions/{tid}")
def session_close(tid: str) -> dict:
    hub.close(tid)
    return {"closed": tid}


@router.websocket("/ws")
async def terminal(socket: WebSocket) -> None:
    await socket.accept()
    try:
        cols = int(socket.query_params.get("cols", "100"))
        rows = int(socket.query_params.get("rows", "30"))
    except ValueError:
        cols, rows = 100, 30
    attach = socket.query_params.get("session")
    if attach and attach in hub.terms:
        term = hub.terms[attach]
        if term.session:
            term.session.resize(cols, rows)
    else:
        base = _base(socket.headers.get("host"), socket.query_params.get("engine"))
        term = hub.open(None, socket.query_params.get("cwd"), cols, rows, base, owned=True)
    queue: asyncio.Queue = asyncio.Queue(maxsize=4000)
    replay, _ = term.read(None)
    if replay and attach:
        await socket.send_text(replay)
    term.listeners.add(queue)

    async def send() -> None:
        while True:
            data = await queue.get()
            if data is None:
                with contextlib.suppress(Exception):
                    await socket.send_text(json.dumps({"exit": True}))
                if term.owned:
                    break
                continue
            await socket.send_text(data)

    sender = asyncio.create_task(send())
    launch = socket.query_params.get("launch")
    if launch in AGENTS:
        term.write(AGENTS[launch] + "\r")
    try:
        while True:
            message = await socket.receive_text()
            if message.startswith("\x00{"):
                try:
                    control = json.loads(message[1:])
                except ValueError:
                    control = {}
                if isinstance(control.get("resize"), list) and len(control["resize"]) == 2 and term.session:
                    term.session.resize(int(control["resize"][0]), int(control["resize"][1]))
                if control.get("launch") in AGENTS:
                    term.write(AGENTS[control["launch"]] + "\r")
                continue
            term.write(message)
    except WebSocketDisconnect:
        pass
    finally:
        term.listeners.discard(queue)
        sender.cancel()
        if term.owned:
            hub.close(term.id)
