"""formencoder's Form functions: window-free, server-free callables `fn(inputs, params, out_dir) -> dict`.

form-functions.json at the repository root lists them; `python -m app.functions` runs one from a shell.
"""

from .encode import encode
from .schema import ParamsError
from .session import FunctionError

FUNCTIONS = {"encode": encode}

__all__ = ["FUNCTIONS", "FunctionError", "ParamsError", "encode"]
