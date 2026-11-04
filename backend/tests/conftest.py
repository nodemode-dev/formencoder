import importlib
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent

APP_ID = "formencoder"
APP_MODULE = "app.main:app"
ENV_PREFIX = "FORMENCODER"
DATA_ENV = "FORMENCODER_DATA_DIR"
PORT_ENV = "FORMENCODER_PORT"
ENGINE_PORT = 8270
HEALTH_PATH = "/api/health"
VERSION_PATH = "/api/version"
VERSION_KEY = "version"
WINDOW_ORIGINS = ["http://localhost:5270", "http://127.0.0.1:5270", "http://localhost:5271", "tauri://localhost", "http://tauri.localhost"]
WS_PATH = "/api/live"
WS_REFUSAL_CODE = 1008
MCP_PATH = "/mcp"
STDIO_CMD = [sys.executable, str(REPO / "setup" / "mcp_stdio.py")]
READ_TOOL = ("status", {})
CHANGING_TOOL = ("history", {"action": "list"})
INAPP_HEADER = "x-formencoder-agent-token"
LOCAL_HEADER = "x-formencoder-local"
VERSION_SITES = [
    ("README.md", r"^Version (\S+) "),
    ("backend/app/__init__.py", r'^__version__ = "([^"]+)"'),
    ("frontend/package.json", r'^  "version": "([^"]+)"'),
    ("frontend/src/version.ts", r"^export const VERSION = '([^']+)'"),
    ("native/Cargo.toml", r'^version = "([^"]+)"'),
    ("native/fencoder-py/pyproject.toml", r'^version = "([^"]+)"'),
    ("src-tauri/Cargo.toml", r'^version = "([^"]+)"'),
    ("src-tauri/tauri.conf.json", r'^  "version": "([^"]+)"'),
]
STRIP_EXEMPT = []


def tool_catalogue():
    from app.agent import tools
    import fe_core

    rows = json.loads(fe_core.Engine().command_list(None, True))
    names = [t["name"] for t in tools.TOOLS]
    taken = set(names)
    return [{"name": n} for n in names] + [{"name": r["mcpName"]} for r in rows if r.get("mcpName") and r["mcpName"] not in taken]


def consent_refusals():
    return {"no_window": "No formencoder window is open", "blocked": "Outside agents are turned off"}


def set_policy(mode):
    os.environ["FORMENCODER_AGENTS"] = {"ask": "ask", "blocked": "deny", "allowed": "allow"}[mode]


def inapp_token():
    return importlib.import_module("app.agent.consent").TOKEN


_SANDBOX = Path(tempfile.mkdtemp(prefix=f"{APP_ID}-tests-"))
for _name in ("data", "home"):
    (_SANDBOX / _name).mkdir()
for _key in [k for k in os.environ if k.startswith(f"{ENV_PREFIX}_")]:
    os.environ.pop(_key)
os.environ[DATA_ENV] = str(_SANDBOX / "data")
os.environ[PORT_ENV] = str(ENGINE_PORT)
os.environ["FORMENCODER_FFMPEG_AUTO"] = "0"
os.environ["FORMENCODER_AUTOSTART"] = "0"
os.environ["HOME"] = str(_SANDBOX / "home")
os.environ["USERPROFILE"] = str(_SANDBOX / "home")
for _key in ("XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME"):
    os.environ[_key] = str(_SANDBOX / "home" / _key.lower())
sys.path.insert(0, str(BACKEND))


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(_SANDBOX, ignore_errors=True)


def own_origin():
    return f"http://127.0.0.1:{ENGINE_PORT}"


@pytest.fixture(scope="session")
def app():
    module, _, attr = APP_MODULE.partition(":")
    return getattr(importlib.import_module(module), attr)


@pytest.fixture(scope="session")
def client(app):
    from fastapi.testclient import TestClient

    with TestClient(app, base_url=own_origin()) as c:
        yield c


@pytest.fixture(scope="session")
def repo_versions():
    found = {}
    for rel, pattern in VERSION_SITES:
        text = (REPO / rel).read_text(encoding="utf-8")
        match = re.search(pattern, text, re.MULTILINE)
        found[rel] = match.group(1) if match else None
    return found


@pytest.fixture(scope="session")
def repo_version(repo_versions):
    return next(iter(repo_versions.values()))


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def get_json(url, timeout=2.0):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.status, json.loads(r.read().decode("utf-8") or "null")


@pytest.fixture(scope="session")
def engine():
    port = free_port()
    data = _SANDBOX / "engine-data"
    data.mkdir()
    env = dict(os.environ, **{DATA_ENV: str(data), PORT_ENV: str(port)})
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", APP_MODULE, "--host", "127.0.0.1", "--port", str(port)],
        cwd=BACKEND, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    base = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + 90
    ready = False
    while time.monotonic() < deadline and proc.poll() is None:
        try:
            status, _ = get_json(base + HEALTH_PATH)
            ready = status == 200
        except OSError:
            ready = False
        if ready:
            break
        time.sleep(0.25)
    if not ready:
        proc.kill()
        out = proc.communicate(timeout=5)[0].decode("utf-8", "replace")
        raise RuntimeError(f"engine did not answer {HEALTH_PATH} within 90 s:\n{out[-4000:]}")
    yield {"base": base, "port": port, "data": data, "env": env, "proc": proc}
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


def ffmpeg_has(encoder):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
    return re.search(rf"^\s*V\S*\s+{re.escape(encoder)}\s", out, re.MULTILINE) is not None


def make_clip(path, seconds=2, size="320x180", rate=25, audio=True, extra=()):
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"testsrc2=size={size}:rate={rate}:duration={seconds}"]
    if audio:
        cmd += ["-f", "lavfi", "-i", f"sine=frequency=440:sample_rate=48000:duration={seconds}"]
    cmd += ["-c:v", "mpeg4", "-q:v", "3"]
    if audio:
        cmd += ["-c:a", "aac", "-b:a", "96k", "-shortest"]
    cmd += [*extra, str(path)]
    subprocess.run(cmd, check=True, capture_output=True)
    return path


def ffprobe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)], check=True, capture_output=True, text=True).stdout
    return json.loads(out)


class Driver:
    def __init__(self, data):
        self.data = Path(data)
        os.environ[DATA_ENV] = str(self.data)
        import fe_core

        self.fe = fe_core
        self.e = fe_core.Engine()
        self.events = []

    def run(self, command, **params):
        return json.loads(self.e.execute(command, json.dumps(params), "test"))

    def refuses(self, command, **params):
        with pytest.raises(ValueError) as caught:
            self.e.execute(command, json.dumps(params), "test")
        return str(caught.value)

    def pump(self, until, timeout=90.0, step=0.05):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            self.e.tick(time.time())
            self.events += json.loads(self.e.drain_events())
            if until():
                return True
            time.sleep(step)
        return False

    def output(self, oid):
        for row in self.run("encode.report", outputs=[oid])["outputs"]:
            if row["output"] == oid:
                return row
        raise KeyError(oid)

    def finish(self, oid, timeout=90.0):
        self.pump(lambda: self.output(oid)["status"] in ("done", "failed", "stopped"), timeout)
        return self.output(oid)

    def close(self):
        self.e.shutdown()


@pytest.fixture
def driver(tmp_path, monkeypatch):
    saved = os.environ.get(DATA_ENV)
    drivers = []

    def make(name="data"):
        d = Driver(tmp_path / name)
        drivers.append(d)
        return d

    yield make
    for d in drivers:
        try:
            d.close()
        except BaseException:
            pass
    if saved is not None:
        os.environ[DATA_ENV] = saved


@pytest.fixture(scope="session")
def clip2(tmp_path_factory):
    return make_clip(tmp_path_factory.mktemp("media") / "src2.mp4", seconds=2)


@pytest.fixture(scope="session")
def long_clip(tmp_path_factory):
    media = tmp_path_factory.mktemp("media")
    part = make_clip(media / "part.mp4", seconds=20, size="640x360", audio=False)
    looped = media / "long.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-stream_loop", "29", "-i", str(part), "-c", "copy", str(looped)], check=True, capture_output=True)
    return looped
