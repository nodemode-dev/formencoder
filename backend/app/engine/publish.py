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
    "youtube": {"label": "YouTube", "fields": ["clientId", "clientSecret", "refreshToken", "title", "description", "tags", "categoryId", "privacy", "madeForKids"]},
    "vimeo": {"label": "Vimeo", "fields": ["accessToken", "title", "description", "privacy"]},
    "facebook": {"label": "Facebook Page", "fields": ["appId", "userToken", "pageId", "pageToken", "title", "description", "graphVersion"]},
    "plugin": {"label": "Plug-in", "fields": ["plugin", "options"]},
}

CHUNK = 8 << 20
VIDEO_EXT = (".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".mpg", ".mpeg", ".ts", ".mts", ".wmv", ".flv", ".3gp")


def _video(files: list[str]) -> str:
    for f in files:
        if f.lower().endswith(VIDEO_EXT):
            return f
    raise ValueError("this destination uploads a video file, and the output wrote none")


def _title(dest: dict, path: str, context: dict) -> str:
    raw = (dest.get("title") or "").strip() or Path(path).stem
    return raw.replace("{name}", Path(path).stem).replace("{source}", Path(str(context.get("source") or "")).stem).replace("{preset}", str(context.get("preset") or ""))


def _http(req: urllib.request.Request, timeout: float = 120) -> tuple[int, dict, bytes]:
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers or {}), exc.read() or b""
    except OSError as exc:
        return 0, {}, str(exc).encode()


def _json(body: bytes) -> dict:
    try:
        v = json.loads(body.decode() or "{}")
        return v if isinstance(v, dict) else {}
    except ValueError:
        return {}


def _youtube(dest: dict, files: list[str], context: dict) -> list[str]:
    path = _video(files)
    for k in ("clientId", "clientSecret", "refreshToken"):
        if not dest.get(k):
            raise ValueError("YouTube needs an OAuth client ID, client secret and refresh token with the youtube.upload scope")
    form = urllib.parse.urlencode({"client_id": dest["clientId"], "client_secret": dest["clientSecret"], "refresh_token": dest["refreshToken"], "grant_type": "refresh_token"}).encode()
    status, _, body = _http(urllib.request.Request("https://oauth2.googleapis.com/token", data=form, method="POST", headers={"content-type": "application/x-www-form-urlencoded"}), 30)
    token = _json(body).get("access_token")
    if status != 200 or not token:
        raise ValueError(f"Google refused the refresh token ({status}): {body[:200]!r}")
    size = os.path.getsize(path)
    tags = [t.strip() for t in str(dest.get("tags") or "").split(",") if t.strip()]
    meta = {"snippet": {"title": _title(dest, path, context)[:100], "description": str(dest.get("description") or ""), "tags": tags, "categoryId": str(dest.get("categoryId") or "22")},
            "status": {"privacyStatus": dest.get("privacy") or "private", "selfDeclaredMadeForKids": bool(dest.get("madeForKids"))}}
    start = urllib.request.Request("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", data=json.dumps(meta).encode(), method="POST",
                                   headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": str(size), "X-Upload-Content-Type": "video/*"})
    status, headers, body = _http(start, 60)
    session = headers.get("Location") or headers.get("location")
    if status != 200 or not session:
        raise ValueError(f"YouTube did not open an upload ({status}): {body[:300]!r}")
    offset = 0
    tries = 0
    with open(path, "rb") as fh:
        while True:
            fh.seek(offset)
            chunk = fh.read(CHUNK)
            last = offset + len(chunk) - 1
            req = urllib.request.Request(session, data=chunk, method="PUT", headers={"Authorization": f"Bearer {token}", "Content-Length": str(len(chunk)), "Content-Range": f"bytes {offset}-{last}/{size}"})
            status, headers, body = _http(req, 600)
            if status in (200, 201):
                vid = _json(body).get("id")
                return [f"https://youtu.be/{vid}" if vid else "youtube"]
            if status == 308:
                rng = headers.get("Range") or headers.get("range") or ""
                offset = int(rng.rsplit("-", 1)[1]) + 1 if "-" in rng else 0
                tries = 0
                continue
            if status in (500, 502, 503, 504) or status == 0:
                tries += 1
                if tries > 5:
                    raise ValueError(f"YouTube kept failing ({status})")
                time.sleep(2 ** tries)
                probe = urllib.request.Request(session, data=b"", method="PUT", headers={"Authorization": f"Bearer {token}", "Content-Length": "0", "Content-Range": f"bytes */{size}"})
                status, headers, body = _http(probe, 60)
                if status in (200, 201):
                    vid = _json(body).get("id")
                    return [f"https://youtu.be/{vid}" if vid else "youtube"]
                rng = headers.get("Range") or headers.get("range") or ""
                offset = int(rng.rsplit("-", 1)[1]) + 1 if "-" in rng else 0
                continue
            raise ValueError(f"YouTube refused the upload ({status}): {body[:300]!r}")


def _vimeo(dest: dict, files: list[str], context: dict) -> list[str]:
    path = _video(files)
    token = dest.get("accessToken") or ""
    if not token:
        raise ValueError("Vimeo needs a personal access token with the upload scope")
    size = os.path.getsize(path)
    head = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.vimeo.*+json;version=3.4", "Content-Type": "application/json"}
    body = {"upload": {"approach": "tus", "size": str(size)}, "name": _title(dest, path, context), "description": str(dest.get("description") or "")}
    if dest.get("privacy"):
        body["privacy"] = {"view": dest["privacy"]}
    status, _, raw = _http(urllib.request.Request("https://api.vimeo.com/me/videos?fields=uri,link,upload", data=json.dumps(body).encode(), method="POST", headers=head), 60)
    made = _json(raw)
    link = (made.get("upload") or {}).get("upload_link")
    if status not in (200, 201) or not link:
        raise ValueError(f"Vimeo did not open an upload ({status}): {raw[:300]!r}")
    offset = 0
    tries = 0
    with open(path, "rb") as fh:
        while offset < size:
            fh.seek(offset)
            chunk = fh.read(CHUNK)
            req = urllib.request.Request(link, data=chunk, method="PATCH", headers={"Tus-Resumable": "1.0.0", "Upload-Offset": str(offset), "Content-Type": "application/offset+octet-stream"})
            status, headers, raw = _http(req, 600)
            if status == 204:
                offset = int(headers.get("Upload-Offset") or headers.get("upload-offset") or offset + len(chunk))
                tries = 0
                continue
            tries += 1
            if tries > 5:
                raise ValueError(f"Vimeo refused the upload ({status}): {raw[:300]!r}")
            time.sleep(2 ** tries)
            st, hh, _ = _http(urllib.request.Request(link, method="HEAD", headers={"Tus-Resumable": "1.0.0"}), 60)
            if st in (200, 204):
                offset = int(hh.get("Upload-Offset") or hh.get("upload-offset") or offset)
    return [made.get("link") or f"https://vimeo.com{str(made.get('uri') or '').replace('/videos', '')}"]


def _facebook(dest: dict, files: list[str], context: dict) -> list[str]:
    path = _video(files)
    for k in ("appId", "userToken", "pageId", "pageToken"):
        if not dest.get(k):
            raise ValueError("Facebook needs the app ID, a user access token, the Page ID and a Page access token")
    version = dest.get("graphVersion") or "v25.0"
    size = os.path.getsize(path)
    q = urllib.parse.urlencode({"file_name": Path(path).name, "file_length": size, "file_type": "video/mp4", "access_token": dest["userToken"]})
    status, _, raw = _http(urllib.request.Request(f"https://graph.facebook.com/{version}/{dest['appId']}/uploads?{q}", data=b"", method="POST"), 60)
    session = _json(raw).get("id")
    if status != 200 or not session:
        raise ValueError(f"Facebook did not open an upload ({status}): {raw[:300]!r}")
    url = f"https://graph.facebook.com/{version}/{session}"
    auth = {"Authorization": f"OAuth {dest['userToken']}"}
    handle = None
    tries = 0
    offset = 0
    while handle is None:
        with open(path, "rb") as fh:
            fh.seek(offset)
            data = fh.read()
        status, _, raw = _http(urllib.request.Request(url, data=data, method="POST", headers={**auth, "file_offset": str(offset)}), 3600)
        handle = _json(raw).get("h") if status == 200 else None
        if handle:
            break
        tries += 1
        if tries > 4:
            raise ValueError(f"Facebook refused the upload ({status}): {raw[:300]!r}")
        time.sleep(2 ** tries)
        st, _, got = _http(urllib.request.Request(url, method="GET", headers=auth), 60)
        offset = int(_json(got).get("file_offset") or 0) if st == 200 else 0
    form = urllib.parse.urlencode({"access_token": dest["pageToken"], "title": _title(dest, path, context), "description": str(dest.get("description") or ""), "fbuploader_video_file_chunk": handle}).encode()
    status, _, raw = _http(urllib.request.Request(f"https://graph-video.facebook.com/{version}/{dest['pageId']}/videos", data=form, method="POST", headers={"content-type": "application/x-www-form-urlencoded"}), 300)
    vid = _json(raw).get("id")
    if status != 200 or not vid:
        raise ValueError(f"Facebook did not publish the video ({status}): {raw[:300]!r}")
    return [f"https://www.facebook.com/{dest['pageId']}/videos/{vid}"]


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
            elif kind == "youtube":
                results.append({"type": kind, "ok": True, "sent": _youtube(dest, files, context)})
            elif kind == "vimeo":
                results.append({"type": kind, "ok": True, "sent": _vimeo(dest, files, context)})
            elif kind == "facebook":
                results.append({"type": kind, "ok": True, "sent": _facebook(dest, files, context)})
            elif kind == "plugin":
                from . import plugins

                opts = dest.get("options") or {}
                if isinstance(opts, str):
                    opts = json.loads(opts) if opts.strip() else {}
                results.append({"type": kind, "ok": True, "sent": plugins.publish(str(dest.get("plugin") or ""), opts if isinstance(opts, dict) else {}, files, context)})
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
