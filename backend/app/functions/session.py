"""A headless formencoder engine for one function call.

The same `fe_core.Engine` the engine service drives on its thread (`app.engine.host`), with no HTTP server,
no window and no persisted queue: each session gets a private data folder that is removed afterwards, so a
function never reads or changes the person's queue, presets or preferences. The engine reads FORMENCODER_DATA_DIR
from the environment, so run one call at a time per process.
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import time
from contextlib import contextmanager
from typing import Any, Callable, Iterator

from .. import native

FINAL = ("done", "failed", "stopped")
_ENV_KEYS = ("FORMENCODER_DATA_DIR", "FORMENCODER_FROZEN", "FORMENCODER_REPO", "FORMENCODER_RESOURCES")


class FunctionError(Exception):
    """A function could not produce its outputs; the message says why in one line."""


class Session:
    def __init__(self, engine: Any) -> None:
        self.engine = engine

    def run(self, command: str, **params: Any) -> Any:
        try:
            return json.loads(self.engine.execute(command, json.dumps(params), "function"))
        except ValueError as exc:
            raise FunctionError(f"{command}: {exc}") from None

    def pump(self, until: Callable[[], bool], timeout: float, step: float = 0.05) -> bool:
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            self.engine.tick(time.time())
            self.engine.drain_events()
            if until():
                return True
            time.sleep(step)
        return False

    def report(self, output: str) -> dict:
        for row in self.run("encode.report", outputs=[output])["outputs"]:
            if row["output"] == output:
                return row
        raise FunctionError(f"the engine has no output {output}")

    def finish(self, output: str, timeout: float) -> dict:
        if not self.pump(lambda: self.report(output)["status"] in FINAL, timeout):
            self.run("queue.stop")
            raise FunctionError(f"the encode did not finish within {int(timeout)} s")
        return self.report(output)


@contextmanager
def headless() -> Iterator[Session]:
    saved = {k: os.environ.get(k) for k in _ENV_KEYS}
    data = tempfile.mkdtemp(prefix="formencoder-fn-")
    os.environ["FORMENCODER_DATA_DIR"] = data
    engine = None
    try:
        native.prepare_env()
        try:
            engine = native.module().Engine()
        except ImportError as exc:
            raise FunctionError(f"the encoding engine is not installed ({exc}); run ./formencoder install-native") from None
        yield Session(engine)
    finally:
        if engine is not None:
            engine.shutdown()
            del engine
        for key, value in saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        shutil.rmtree(data, ignore_errors=True)
