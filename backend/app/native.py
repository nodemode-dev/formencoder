from __future__ import annotations

import json
import os

from .core import config


def prepare_env() -> None:
    os.environ.setdefault("FORMENCODER_DATA_DIR", str(config.data_dir()))
    if config.FROZEN:
        os.environ["FORMENCODER_FROZEN"] = "1"
    root = config.repo_root()
    if root:
        os.environ.setdefault("FORMENCODER_REPO", str(root))
    res = config.resources_dir()
    if res.is_dir():
        os.environ.setdefault("FORMENCODER_RESOURCES", str(res))


def module():
    import fe_core

    return fe_core


def available() -> tuple[bool, str]:
    try:
        return True, module().__version__
    except BaseException as exc:
        return False, repr(exc)


def version() -> dict:
    try:
        return json.loads(module().version())
    except BaseException:
        return {"core": None}
