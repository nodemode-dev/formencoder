"""The small JSON Schema subset the function manifests use, checked without a dependency."""

from __future__ import annotations

from typing import Any

_TYPES = {"object": dict, "string": str, "integer": int, "number": (int, float), "boolean": bool, "array": list}


class ParamsError(ValueError):
    """The params do not match the function's schema."""


def validate(value: Any, schema: dict, where: str = "params") -> None:
    kind = schema.get("type")
    if kind and (not isinstance(value, _TYPES[kind]) or (kind != "boolean" and isinstance(value, bool))):
        raise ParamsError(f"{where} must be a{'n' if kind[0] in 'aeiou' else ''} {kind}")
    if "enum" in schema and value not in schema["enum"]:
        raise ParamsError(f"{where} {value!r} is not one of the {len(schema['enum'])} allowed values (see form-functions.json)")
    if kind != "object":
        return
    props = schema.get("properties") or {}
    for name in schema.get("required") or []:
        if name not in value:
            raise ParamsError(f"{where}.{name} is required")
    if schema.get("additionalProperties") is False:
        extra = sorted(set(value) - set(props))
        if extra:
            raise ParamsError(f"{where} has unknown {', '.join(extra)}; allowed: {', '.join(props)}")
    for name, sub in props.items():
        if name in value:
            validate(value[name], sub, f"{where}.{name}")
