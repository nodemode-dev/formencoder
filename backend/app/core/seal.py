import hashlib
import hmac
import json
import secrets

SERVICE = "FormEncoder"
ACCOUNT = "settings-seal"
FIELD = "seal"
_CACHE: dict = {"tried": False, "available": False, "key": None}


def reset() -> None:
    _CACHE.update(tried=False, available=False, key=None)


def _load(create: bool) -> bytes | None:
    if _CACHE["tried"] and (_CACHE["key"] is not None or not _CACHE["available"] or not create):
        return _CACHE["key"]
    _CACHE["tried"] = True
    try:
        import keyring

        stored = keyring.get_password(SERVICE, ACCOUNT)
        if not stored and create:
            keyring.set_password(SERVICE, ACCOUNT, secrets.token_hex(32))
            stored = keyring.get_password(SERVICE, ACCOUNT)
        key = bytes.fromhex(stored) if stored else None
    except Exception:
        _CACHE.update(available=False, key=None)
        return None
    _CACHE.update(available=True, key=key)
    return key


def available() -> bool:
    _load(False)
    return _CACHE["available"]


def digest(label: str, values: dict, key: bytes) -> str:
    body = json.dumps({"label": label, "values": {k: v for k, v in values.items() if k != FIELD}}, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hmac.new(key, body.encode("utf-8"), hashlib.sha256).hexdigest()


def read(label: str, stored: dict, loosened: bool) -> str:
    key = _load(False)
    if not _CACHE["available"]:
        return "unavailable"
    mark = stored.get(FIELD)
    if key is not None and isinstance(mark, str) and hmac.compare_digest(mark, digest(label, stored, key)):
        return "ok"
    return "broken" if loosened else "unsealed"


def sign(label: str, values: dict) -> dict:
    clean = {k: v for k, v in values.items() if k != FIELD}
    key = _load(True)
    if key is None:
        return clean
    return {**clean, FIELD: digest(label, clean, key)}


def summary(states: list[str]) -> str:
    for state in ("broken", "unavailable", "unsealed"):
        if state in states:
            return state
    return "ok"
