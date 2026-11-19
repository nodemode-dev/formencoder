import asyncio
import codecs
import contextlib
import json
import os
import re
import shutil
import signal
import struct
import subprocess
import threading
import time

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect

from ..agent import consent, workspace
from ..core import config, window_key

router = APIRouter(prefix="/api/terminal", tags=["terminal"])
POSIX = os.name == "posix"
AGENTS = {"claude": "claude", "codex": "codex", "cursor": "cursor-agent"}
PROGRAMS = {
    "claude": {"title": "Claude Code", "install": "irm https://claude.ai/install.ps1 | iex" if os.name == "nt" else "curl -fsSL https://claude.ai/install.sh | bash"},
    "codex": {"title": "Codex", "install": "npm install -g @openai/codex"},
    "cursor": {"title": "Cursor", "install": "curl https://cursor.com/install -fsS | bash"},
}
RESUME = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{7,79}")
PROMPT_MAX = 20000
VERSION_KEEP = 60.0
_VERSIONS: dict[str, tuple[float, str | None]] = {}


def _version(path: str) -> str | None:
    now = time.monotonic()
    kept = _VERSIONS.get(path)
    if kept and now - kept[0] < VERSION_KEEP:
        return kept[1]
    env = {k: v for k, v in os.environ.items() if not k.startswith("FORMENCODER_")}
    try:
        out = subprocess.run([path, "--version"], capture_output=True, text=True, timeout=5, stdin=subprocess.DEVNULL, env=env)
        lines = out.stdout.strip().splitlines() if out.returncode == 0 else []
    except (OSError, subprocess.SubprocessError):
        lines = []
    found = lines[0].strip()[:80] if lines else None
    _VERSIONS[path] = (now, found)
    return found


def _program(kind: str) -> dict:
    path = shutil.which(AGENTS[kind])
    return {"installed": path is not None, "path": path, "version": _version(path) if path else None, "signedIn": None,
            "install": PROGRAMS[kind]["install"], "title": PROGRAMS[kind]["title"], "program": AGENTS[kind]}


def _environment(base_url: str, token: str | None) -> dict:
    ws = workspace.ensure()
    env = dict(os.environ)
    env["FORMENCODER_URL"] = base_url
    env.pop("FORMENCODER_AGENT_TOKEN", None)
    if token:
        env["FORMENCODER_AGENT_TOKEN"] = token
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
    def __init__(self, cols: int, rows: int, env: dict, cwd: str, argv: list[str] | None = None):
        self.cols, self.rows = max(20, min(500, cols)), max(5, min(300, rows))
        self.pid = None
        self.fd = None
        self.process = None
        self.winpty = None
        self.decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
        command = argv or _shell()
        if POSIX:
            import pty

            pid, fd = pty.fork()
            if pid == 0:
                try:
                    os.chdir(cwd)
                except OSError:
                    os.chdir(os.path.expanduser("~"))
                try:
                    os.execvpe(command[0], command, env)
                except OSError:
                    os._exit(127)
            self.pid, self.fd = pid, fd
            self.resize(self.cols, self.rows)
            return
        try:
            from winpty import PtyProcess

            self.winpty = PtyProcess.spawn(command, cwd=cwd, env=env, dimensions=(self.rows, self.cols))
        except Exception:
            self.process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env, cwd=cwd)

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

    def _decoded(self, fetch) -> str:
        while True:
            try:
                raw = fetch()
            except OSError:
                tail = self.decoder.decode(b"", final=True)
                if tail:
                    return tail
                raise
            if not raw:
                return self.decoder.decode(b"", final=True)
            text = self.decoder.decode(raw)
            if text:
                return text

    def read(self) -> str:
        if POSIX and self.fd is not None:
            return self._decoded(lambda: os.read(self.fd, 65536))
        if self.winpty is not None:
            return self.winpty.read(65536)
        if self.process and self.process.stdout:
            stdout = self.process.stdout
            return self._decoded(lambda: stdout.read1(65536) if hasattr(stdout, "read1") else stdout.readline())
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


@router.get("/agents")
def agent_programs(request: Request) -> dict:
    window_key.require(request)
    return {"agents": {kind: _program(kind) for kind in PROGRAMS}}


KEEP = 256_000


class Term:
    def __init__(self, tid: str, title: str, cwd: str, cols: int, rows: int, base: str, owned: bool, trusted: bool = False,
                 kind: str = "shell", window: bool = False, argv: list[str] | None = None) -> None:
        self.id, self.title, self.cwd, self.base, self.owned = tid, title, cwd, base, owned
        self.trusted = trusted
        self.kind, self.window, self.argv = kind, window, argv
        self.token: str | None = None
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
        consent.revoke(self.token)
        self.token = consent.issue() if self.trusted else None
        self.session = Session(cols, rows, _environment(self.base, self.token), self.cwd, self.argv)
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
            if POSIX and session.pid:
                with contextlib.suppress(OSError):
                    os.waitpid(session.pid, 0)
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
        if self.window:
            consent.revoke(self.token)
            self.token = None
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
        for q in list(self.listeners):
            with contextlib.suppress(asyncio.QueueFull):
                q.put_nowait({"type": "restart"})
        self._feed("\r\n[formencoder] terminal restarted\r\n")
        self._start(cols, rows)

    def close(self) -> None:
        if self.session:
            self.session.close()
        self.exited = True
        consent.revoke(self.token)
        self.token = None
        for q in list(self.listeners):
            with contextlib.suppress(asyncio.QueueFull):
                q.put_nowait({"type": "closed"})

    def row(self) -> dict:
        return {"id": self.id, "title": self.title, "cwd": self.cwd, "created": self.created, "exited": self.exited, "owned": self.owned, "offset": self.offset, "opener": self.opener,
                "kind": self.kind if self.opener == "ui" else "agent", "alive": not self.exited}


class Hub:
    def __init__(self) -> None:
        self.terms: dict[str, Term] = {}
        self._n = 0

    def changed(self) -> None:
        from ..engine.host import host as engine_host

        engine_host.bus.publish({"type": "terminals", "sessions": self.listing()}, ("ui",))
        engine_host.bus.publish({"type": "terminalTabs", "tabs": self.tabs()}, ("ui",))

    def listing(self) -> list[dict]:
        return [t.row() for t in self.terms.values() if not t.owned and not t.window]

    def tabs(self) -> list[dict]:
        return [t.row() for t in self.terms.values() if t.window]

    def listed(self, tid: str) -> Term:
        term = self.get(tid)
        if term.window:
            raise KeyError(f"no terminal {tid!r}; open terminals: {', '.join(t['id'] for t in self.listing()) or 'none'}")
        return term

    def open(self, title: str | None, cwd: str | None, cols: int, rows: int, base: str, owned: bool = False, run: str | None = None, trusted: bool = False,
             kind: str = "shell", window: bool = False, argv: list[str] | None = None) -> Term:
        self._n += 1
        tid = f"t{self._n}"
        place = cwd or str(workspace.ensure())
        term = Term(tid, title or f"Terminal {self._n}", place, cols, rows, base, owned, trusted, kind, window, argv)
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


@router.get("/tabs")
def tabs(request: Request) -> dict:
    window_key.require(request)
    return {"tabs": hub.tabs()}


@router.post("/tabs")
async def open_tab(request: Request) -> dict:
    body = await request.json() if (await request.body()) else {}
    if not isinstance(body, dict):
        body = {}
    kind = body.get("kind") or "shell"
    prompt, resume = body.get("prompt") or None, body.get("resume") or None
    if kind != "shell" and kind not in PROGRAMS:
        raise HTTPException(422, {"code": "unknown_kind", "message": f"No tab kind called {kind}. Kinds: shell, {', '.join(PROGRAMS)}."})
    if prompt is not None and (kind == "shell" or not isinstance(prompt, str) or len(prompt) > PROMPT_MAX):
        raise HTTPException(422, {"code": "bad_prompt", "message": f"A prompt is text of at most {PROMPT_MAX} characters for an agent tab."})
    if resume is not None and (kind != "claude" or not isinstance(resume, str) or not RESUME.fullmatch(resume)):
        raise HTTPException(422, {"code": "bad_resume", "message": "resume is a Claude Code session id, for a claude tab only."})
    try:
        cols, rows = int(body.get("cols") or 100), int(body.get("rows") or 30)
    except (TypeError, ValueError):
        cols, rows = 100, 30
    argv = None
    if kind in PROGRAMS:
        path = shutil.which(AGENTS[kind])
        if path is None:
            raise HTTPException(404, {"code": "not_installed", "message": f"{PROGRAMS[kind]['title']} is not installed on this computer.", "install": PROGRAMS[kind]["install"]})
        argv = [path, *(["--resume", resume] if resume else []), *((["--", prompt] if prompt.startswith("-") else [prompt]) if prompt else [])]
    title = body.get("title") if isinstance(body.get("title"), str) else None
    cwd = body.get("cwd") if isinstance(body.get("cwd"), str) else None
    try:
        term = hub.open(title or (PROGRAMS[kind]["title"] if argv else None), cwd, cols, rows, _base(request.headers.get("host")), trusted=argv is not None, kind=kind, window=True, argv=argv)
    except OSError as exc:
        raise HTTPException(500, {"code": "failed", "message": f"The program could not start: {exc}"}) from None
    return term.row()


@router.post("/sessions")
async def open_session(request: Request) -> dict:
    body = await request.json() if (await request.body()) else {}
    launch = body.get("launch")
    run = AGENTS.get(launch) if launch in AGENTS else None
    term = hub.open(body.get("title"), body.get("cwd"), int(body.get("cols") or 100), int(body.get("rows") or 30), _base(request.headers.get("host")), run=run, trusted=True)
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
def session_output(tid: str, request: Request, since: int | None = None) -> dict:
    window_key.require(request)
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
    if not window_key.spend(socket.query_params.get("ticket")):
        await socket.close(code=4403)
        return
    await socket.accept()
    try:
        cols = int(socket.query_params.get("cols", "100"))
        rows = int(socket.query_params.get("rows", "30"))
    except ValueError:
        cols, rows = 100, 30
    attach = socket.query_params.get("session")
    typed = socket.query_params.get("typed") == "1"
    if attach and attach in hub.terms:
        term = hub.terms[attach]
        if term.session:
            term.session.resize(cols, rows)
    elif attach and typed:
        await socket.send_bytes(json.dumps({"type": "gone", "id": attach}).encode("utf-8"))
        await socket.close(code=4404)
        return
    else:
        base = _base(socket.headers.get("host"), socket.query_params.get("engine"))
        term = hub.open(None, socket.query_params.get("cwd"), cols, rows, base, owned=True, trusted=True)
    queue: asyncio.Queue = asyncio.Queue(maxsize=4000)
    replay, _ = term.read(None)
    if typed:
        await socket.send_bytes(json.dumps({"type": "hello", "id": term.id, "kind": term.kind, "alive": not term.exited}).encode("utf-8"))
    if replay and attach:
        await socket.send_text(replay)
    if typed and term.exited:
        await socket.send_bytes(json.dumps({"type": "exit"}).encode("utf-8"))
    term.listeners.add(queue)

    async def send() -> None:
        while True:
            data = await queue.get()
            if isinstance(data, dict):
                if typed:
                    await socket.send_bytes(json.dumps(data).encode("utf-8"))
                    if data.get("type") == "closed":
                        await socket.close()
                        break
                continue
            if data is None:
                with contextlib.suppress(Exception):
                    if typed:
                        await socket.send_bytes(json.dumps({"type": "exit"}).encode("utf-8"))
                    else:
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
            if typed:
                try:
                    control = json.loads(message)
                except ValueError:
                    control = None
                if not isinstance(control, dict):
                    continue
                if control.get("type") == "input" and isinstance(control.get("data"), str):
                    term.write(control["data"])
                elif control.get("type") == "resize" and term.session:
                    with contextlib.suppress(TypeError, ValueError):
                        term.session.resize(int(control.get("cols")), int(control.get("rows")))
                continue
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
