import json
import os
import socket
import sys
import threading
import time
from pathlib import Path


def _bundle() -> Path:
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))


def selfcheck() -> int:
    report = {"python": sys.version.split()[0], "frozen": bool(getattr(sys, "frozen", False))}
    try:
        from app import native

        native.prepare_env()
        core = native.module()
        caps = json.loads(core.Engine().execute("app.capabilities", "{}", "selfcheck"))
        info = json.loads(core.ffmpeg_info())
        report.update({"core": core.__version__, "commands": caps.get("commands"), "formats": caps.get("formats"), "presets": caps.get("presets"), "ffmpeg": info.get("ffmpeg"), "ffmpegOrigin": info.get("origin"), "ok": True})
    except BaseException as exc:
        report.update({"core": None, "error": repr(exc), "ok": False})
    report["interface"] = (_bundle() / "frontend_dist" / "index.html").is_file()
    report["skills"] = (_bundle() / "skills").is_dir()
    print(json.dumps(report))
    return 0 if report["ok"] else 1


def _alive(pid: int) -> bool:
    if os.name == "nt":
        import ctypes

        handle = ctypes.windll.kernel32.OpenProcess(0x00100000, False, pid)
        if not handle:
            return False
        try:
            return ctypes.windll.kernel32.WaitForSingleObject(handle, 0) != 0
        finally:
            ctypes.windll.kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _watch_parent() -> None:
    raw = os.environ.get("FORMENCODER_PARENT_PID", "").strip()
    if not raw.isdigit():
        return
    pid = int(raw)

    def loop() -> None:
        while _alive(pid):
            time.sleep(1.0)
        try:
            from app.core import discovery

            discovery.withdraw()
        finally:
            os._exit(0)

    threading.Thread(target=loop, name="formencoder-parent-watch", daemon=True).start()


def serve(headless: bool) -> None:
    import uvicorn

    _watch_parent()
    dist = _bundle() / "frontend_dist"
    if (dist / "index.html").is_file():
        os.environ.setdefault("FORMENCODER_DIST", str(dist))
    if not headless:
        os.environ["FORMENCODER_DESKTOP"] = "1"
    port = int(os.environ.get("FORMENCODER_PORT") or ("8270" if headless else "0"))
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", port))
    sock.listen()
    port = sock.getsockname()[1]
    os.environ["FORMENCODER_PORT"] = str(port)
    from app import __version__
    from app.core import discovery
    from app.main import app

    print(f"Uvicorn running on http://127.0.0.1:{port}", flush=True)
    discovery.publish(f"http://127.0.0.1:{port}", __version__)
    server = uvicorn.Server(uvicorn.Config(app, log_level="warning"))
    server.run(sockets=[sock])


def main() -> int:
    args = sys.argv[1:]
    if args and args[0] == "--cli":
        from app.agent.cli import main as cli_main

        return cli_main(args[1:])
    if args and args[0] == "--mcp":
        from app.agent.stdio import main as stdio_main

        stdio_main()
        return 0
    if "--selfcheck" in args:
        return selfcheck()
    serve(headless="--headless" in args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
