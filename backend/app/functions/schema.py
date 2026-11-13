"""The small JSON Schema subset the function manifests use, checked without a dependency."""

from __future__ import annotations

from typing import Any

_TYPES = {"object": dict, "string": str, "integer": int, "number": (int, float), "boolean": bool, "array": list}


def _is(value: Any, kind: str) -> bool:
    if kind == "null":
        return value is None
    return isinstance(value, _TYPES[kind]) and (kind == "boolean" or not isinstance(value, bool))


def _same(a: Any, b: Any) -> bool:
    """Equal and of the same JSON type: True is not 1, 25 matches 25.0."""
    if isinstance(a, bool) or isinstance(b, bool) or a is None or b is None:
        return type(a) is type(b) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a == b
    return type(a) is type(b) and a == b


def _article(kind: str) -> str:
    return kind if kind == "null" else f"a{'n' if kind[0] in 'aeiou' else ''} {kind}"


class ParamsError(ValueError):
    """The params do not match the function's schema."""


def validate(value: Any, schema: dict, where: str = "params") -> None:
    kinds = schema.get("type")
    kinds = [kinds] if isinstance(kinds, str) else kinds or []
    if kinds and not any(_is(value, k) for k in kinds):
        raise ParamsError(f"{where} must be {' or '.join(_article(k) for k in kinds)}")
    kind = next((k for k in kinds if _is(value, k)), None)
    if "enum" in schema and not any(_same(value, v) for v in schema["enum"]):
        allowed = schema["enum"]
        listed = ", ".join(map(repr, allowed)) if len(allowed) <= 20 else f"the {len(allowed)} allowed values (see form-functions.json)"
        raise ParamsError(f"{where} {value!r} is not one of {listed}")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            raise ParamsError(f"{where} {value} is below {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            raise ParamsError(f"{where} {value} is above {schema['maximum']}")
    if kind != "object":
        return
    props = schema.get("properties") or {}
    for name in schema.get("required") or []:
        if name not in value:
            raise ParamsError(f"{where}.{name} is required")
    if schema.get("additionalProperties") is False:
        extra = sorted(set(value) - set(props))
        if extra:
            raise ParamsError(f"{where} has {', '.join(extra)}, which a function cannot set; allowed: {', '.join(props)}")
    for name, sub in props.items():
        if name in value:
            validate(value[name], sub, f"{where}.{name}")
