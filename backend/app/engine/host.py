from __future__ import annotations

import asyncio
import collections
import concurrent.futures
import json
import queue
import threading
import time
from typing import Any, Callable

from .bus import Bus

_STOP = object()


class EngineError(Exception):
    pass


class EngineHost:
    def __init__(self) -> None:
        self.bus = Bus()
        self.engine: Any = None
        self.error: str | None = None
        self.revision = 0
        self.running = False
        self.activity: collections.deque = collections.deque(maxlen=300)
        self.finished: dict[str, dict] = {}
        self._q: queue.Queue = queue.Queue()
        self._ready = threading.Event()
        self._thread: threading.Thread | None = None
        self.previews = concurrent.futures.ThreadPoolExecutor(max_workers=3, thread_name_prefix="formencoder-preview")
        self.jobs = concurrent.futures.ThreadPoolExecutor(max_workers=4, thread_name_prefix="formencoder-bridge")

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        self.bus.bind(loop)
        if self._thread:
            return
        self._thread = threading.Thread(target=self._run, name="formencoder-engine", daemon=True)
        self._thread.start()
        self._ready.wait(120)

    def stop(self) -> None:
        if self._thread:
            self._q.put(_STOP)
            self._thread.join(timeout=8)
        self.previews.shutdown(wait=False, cancel_futures=True)
        self.jobs.shutdown(wait=False, cancel_futures=True)

    @property
    def available(self) -> bool:
        return self.engine is not None

    def _run(self) -> None:
        try:
            from .. import native

            native.prepare_env()
            self.engine = native.module().Engine()
            self.revision = self.engine.revision()
        except BaseException as exc:
            self.error = f"the encoding engine did not load: {exc!r}. Run ./formencoder install-native"
            self._ready.set()
            return
        self._ready.set()
        last_tick = 0.0
        while True:
            try:
                item = self._q.get(timeout=0.05)
            except queue.Empty:
                item = None
            if item is _STOP:
                break
            if item is not None:
                fn, fut = item
                if fut.set_running_or_notify_cancel():
                    try:
                        fut.set_result(fn(self.engine))
                    except BaseException as exc:
                        fut.set_exception(exc)
            now = time.time()
            if now - last_tick >= 0.1:
                last_tick = now
                try:
                    report = json.loads(self.engine.tick(now))
                    self.running = bool(report.get("running")) or bool(report.get("jobs"))
                except BaseException:
                    pass
            self._flush()
        try:
            self.engine.shutdown()
        except BaseException:
            pass

    def _flush(self) -> None:
        try:
            events = json.loads(self.engine.drain_events())
            self.revision = self.engine.revision()
        except BaseException:
            return
        for ev in events:
            kind = ev.get("type")
            if kind == "familyRequest":
                self.finished.pop(str(ev.get("output")), None)
                self.jobs.submit(self._family, ev)
                continue
            if kind == "publishRequest":
                self.jobs.submit(self._publish, ev)
                continue
            if kind == "activity":
                self.activity.append({k: ev.get(k) for k in ("time", "source", "command", "ok", "error")})
            if kind == "finished":
                self.finished[str(ev.get("output"))] = ev
                if len(self.finished) > 2000:
                    self.finished.pop(next(iter(self.finished)))
            self.bus.publish(ev)

    def _family(self, ev: dict) -> None:
        from . import family

        oid = str(ev.get("output"))

        def report(p: float, message: str) -> None:
            self.bus.publish({"type": "progress", "output": oid, "status": "preparing", "progress": 0.0, "fetch": round(p, 3), "message": message})

        try:
            media = family.materialize(ev.get("spec") or {}, report, lambda: oid in self.finished)
            args = {"output": oid, "media": media}
        except BaseException as exc:
            args = {"output": oid, "error": str(exc) or exc.__class__.__name__}
        try:
            self.call_sync(lambda e: e.execute("family.resolved", json.dumps(args), "engine"))
        except BaseException:
            pass

    def _publish(self, ev: dict) -> None:
        from . import publish

        oid = str(ev.get("output"))
        try:
            results = publish.run(ev.get("destinations") or [], ev.get("files") or [], ev.get("context") or {})
        except BaseException as exc:
            results = [{"type": "publish", "ok": False, "error": str(exc)}]
        try:
            self.call_sync(lambda e: e.execute("publish.result", json.dumps({"output": oid, "results": results}), "engine"))
        except BaseException:
            pass

    def submit(self, fn: Callable[[Any], Any]) -> concurrent.futures.Future:
        fut: concurrent.futures.Future = concurrent.futures.Future()
        if self.engine is None:
            fut.set_exception(EngineError(self.error or "the encoding engine is not loaded"))
            return fut
        self._q.put((fn, fut))
        return fut

    async def call(self, fn: Callable[[Any], Any]) -> Any:
        return await asyncio.wrap_future(self.submit(fn))

    def call_sync(self, fn: Callable[[Any], Any], timeout: float = 600) -> Any:
        return self.submit(fn).result(timeout)


host = EngineHost()
