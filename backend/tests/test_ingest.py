import hashlib
import os
import threading

import pytest


def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def card(tmp_path, big=0):
    root = tmp_path / "CARD"
    (root / "DCIM" / "100").mkdir(parents=True)
    (root / "DCIM" / "100" / "A001.bin").write_bytes(os.urandom(300_000))
    (root / "DCIM" / "100" / "A002.bin").write_bytes(os.urandom(70_000))
    if big:
        (root / "DCIM" / "B001.bin").write_bytes(os.urandom(big))
    return root


def ingest(d, root, dest, verify):
    added = d.run("ingest.copy", paths=[str(root)], destination=str(dest), verify=verify, start=True)
    item = added["items"][0]
    rows = d.run("queue.list")
    out = next(o["id"] for it in rows["items"] if it["id"] == item for o in it["outputs"])
    return d.finish(out)


@pytest.mark.parametrize("verify", ["size", "md5", "bit"])
def test_card_copy_is_complete_and_identical(driver, tmp_path, verify):
    root = card(tmp_path)
    dest = tmp_path / "dest"
    row = ingest(driver(), root, dest, verify)
    assert row["status"] == "done", row
    for rel in ("DCIM/100/A001.bin", "DCIM/100/A002.bin"):
        assert md5(dest / "CARD" / rel) == md5(root / rel)


def test_md5_check_catches_a_copy_that_changes_after_it_was_written(driver, tmp_path):
    root = card(tmp_path, big=160_000_000)
    dest = tmp_path / "dest"
    target = dest / "CARD" / "DCIM" / "B001.bin"
    size = (root / "DCIM" / "B001.bin").stat().st_size
    stop = threading.Event()

    def tamper():
        while not stop.is_set():
            try:
                if target.stat().st_size == size:
                    with open(target, "r+b") as f:
                        f.seek(size - 1)
                        last = f.read(1)
                        f.seek(size - 1)
                        f.write(bytes([last[0] ^ 0xFF]))
                    return
            except OSError:
                pass

    worker = threading.Thread(target=tamper, daemon=True)
    worker.start()
    try:
        row = ingest(driver(), root, dest, "md5")
    finally:
        stop.set()
        worker.join(5)
    assert row["status"] == "failed", row
    assert "MD5" in str(row["error"])
