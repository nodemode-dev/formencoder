from __future__ import annotations

import datetime
import ftplib
import hashlib
import hmac
import json
import os
import shutil
import time
import urllib.parse
import urllib.request
from pathlib import Path

DESTINATIONS = {
    "folder": {"label": "Folder", "fields": ["path", "deleteLocal"]},
    "ftp": {"label": "FTP", "fields": ["host", "port", "user", "password", "remotePath", "retries", "tls"]},
    "s3": {"label": "S3-compatible storage", "fields": ["endpoint", "region", "bucket", "prefix", "accessKey", "secretKey", "deleteLocal"]},
    "webhook": {"label": "Webhook", "fields": ["url", "secret"]},
    "family": {"label": "Form family app", "fields": ["app", "project"]},
}


def _ftp(dest: dict, files: list[str]) -> list[str]:
    host = dest.get("host") or ""
    if not host:
        raise ValueError("FTP needs a server")
    port = int(dest.get("port") or 21)
    tries = max(1, int(dest.get("retries") or 3))
    remote = (dest.get("remotePath") or "").strip("/")
    sent = []
    for f in files:
        for attempt in range(tries):
            try:
                ftp = ftplib.FTP_TLS() if dest.get("tls") else ftplib.FTP()
                ftp.connect(host, port, timeout=60)
                ftp.login(dest.get("user") or "anonymous", dest.get("password") or "")
                if dest.get("tls"):
                    ftp.prot_p()
                if remote:
                    for part in remote.split("/"):
                        try:
                            ftp.cwd(part)
                        except ftplib.error_perm:
                            ftp.mkd(part)
                            ftp.cwd(part)
                with open(f, "rb") as handle:
                    ftp.storbinary(f"STOR {Path(f).name}", handle, blocksize=1 << 20)
                ftp.quit()
                sent.append(f"ftp://{host}/{remote + '/' if remote else ''}{Path(f).name}")
                break
            except (OSError, ftplib.Error) as exc:
                if attempt == tries - 1:
                    raise ValueError(f"FTP upload of {Path(f).name} failed: {exc}") from None
                time.sleep(2 * (attempt + 1))
    return sent


def _sign(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode(), hashlib.sha256).digest()


def _s3(dest: dict, files: list[str]) -> list[str]:
    endpoint = (dest.get("endpoint") or "https://s3.amazonaws.com").rstrip("/")
    region = dest.get("region") or "us-east-1"
    bucket = dest.get("bucket") or ""
    if not bucket or not dest.get("accessKey") or not dest.get("secretKey"):
        raise ValueError("S3 needs a bucket, an access key and a secret key")
    prefix = (dest.get("prefix") or "").strip("/")
    sent = []
    for f in files:
        key = f"{prefix + '/' if prefix else ''}{Path(f).name}"
        url = f"{endpoint}/{bucket}/{urllib.parse.quote(key)}"
        parsed = urllib.parse.urlparse(url)
        now = datetime.datetime.now(datetime.UTC)
        amz = now.strftime("%Y%m%dT%H%M%SZ")
        day = now.strftime("%Y%m%d")
        digest = hashlib.sha256()
        with open(f, "rb") as h:
            for block in iter(lambda: h.read(1 << 20), b""):
                digest.update(block)
        payload = digest.hexdigest()
        headers = {"host": parsed.netloc, "x-amz-content-sha256": payload, "x-amz-date": amz}
        signed = ";".join(sorted(headers))
        canonical = "\n".join(["PUT", parsed.path, "", "".join(f"{k}:{headers[k]}\n" for k in sorted(headers)), signed, payload])
        scope = f"{day}/{region}/s3/aws4_request"
        to_sign = "\n".join(["AWS4-HMAC-SHA256", amz, scope, hashlib.sha256(canonical.encode()).hexdigest()])
        k = _sign(_sign(_sign(_sign(("AWS4" + dest["secretKey"]).encode(), day), region), "s3"), "aws4_request")
        sig = hmac.new(k, to_sign.encode(), hashlib.sha256).hexdigest()
        auth = f"AWS4-HMAC-SHA256 Credential={dest['accessKey']}/{scope}, SignedHeaders={signed}, Signature={sig}"
        size = os.path.getsize(f)
        with open(f, "rb") as body:
            req = urllib.request.Request(url, data=body, method="PUT", headers={**headers, "Authorization": auth, "Content-Length": str(size)})
            try:
                with urllib.request.urlopen(req, timeout=600) as r:
                    if r.status >= 300:
                        raise ValueError(f"S3 answered {r.status}")
            except urllib.error.HTTPError as exc:
                raise ValueError(f"S3 refused {Path(f).name}: {exc.code} {exc.read()[:200]!r}") from None
        sent.append(url)
    return sent


def _webhook(dest: dict, files: list[str], context: dict) -> list[str]:
    url = dest.get("url") or ""
    if not url.startswith(("http://", "https://")):
        raise ValueError("the webhook needs an http(s) URL")
    body = json.dumps({"event": "formencoder.output.done", "files": files, **context}).encode()
    headers = {"content-type": "application/json"}
    if dest.get("secret"):
        headers["x-formencoder-signature"] = hmac.new(dest["secret"].encode(), body, hashlib.sha256).hexdigest()
    req = urllib.request.Request(url, data=body, method="POST", headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return [f"webhook {r.status}"]


def run(destinations: list[dict], files: list[str], context: dict) -> list[dict]:
    results = []
    for dest in destinations or []:
        if not dest.get("enabled", True):
            continue
        kind = dest.get("type")
        try:
            if kind == "folder":
                target = Path(dest.get("path") or "").expanduser()
                if not str(target):
                    raise ValueError("the folder destination needs a path")
                target.mkdir(parents=True, exist_ok=True)
                done = []
                for f in files:
                    shutil.copy2(f, target / Path(f).name)
                    done.append(str(target / Path(f).name))
                results.append({"type": kind, "ok": True, "sent": done})
            elif kind == "ftp":
                results.append({"type": kind, "ok": True, "sent": _ftp(dest, files)})
            elif kind == "s3":
                results.append({"type": kind, "ok": True, "sent": _s3(dest, files)})
            elif kind == "webhook":
                results.append({"type": kind, "ok": True, "sent": _webhook(dest, files, context)})
            elif kind == "family":
                from . import family

                results.append({"type": kind, "ok": True, "sent": family.send(dest.get("app") or "formcut", files, dest.get("project"))})
            else:
                raise ValueError(f"unknown destination {kind!r}")
        except Exception as exc:
            results.append({"type": kind, "ok": False, "error": str(exc)})
    if any(r["ok"] for r in results) and any(d.get("deleteLocal") for d in destinations or [] if d.get("type") in ("folder", "s3")):
        if all(r["ok"] for r in results):
            for f in files:
                try:
                    os.remove(f)
                except OSError:
                    pass
            results.append({"type": "deleteLocal", "ok": True, "sent": files})
    return results
