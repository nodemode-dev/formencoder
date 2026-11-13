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
    folder = dest / "CARD" / "DCIM"
    folder.mkdir(parents=True)
    target = folder / "B001.bin"
    target.write_bytes(b"old")
    size = (root / "DCIM" / "B001.bin").stat().st_size
    stop = threading.Event()

    def tamper():
        while not stop.is_set():
            for part in folder.glob(".B001.bin.*.fe-part"):
                try:
                    if part.stat().st_size == size:
                        with open(part, "r+b") as f:
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
    assert target.read_bytes() == b"old"
    assert list(folder.glob(".*.fe-part")) == []


def ingest_file(d, src, dest, verify):
    added = d.run("ingest.copy", paths=[str(src)], destination=str(dest), verify=verify, start=True)
    item = added["items"][0]
    rows = d.run("queue.list")
    out = next(o["id"] for it in rows["items"] if it["id"] == item for o in it["outputs"])
    return d.finish(out)


@pytest.mark.skipif(not hasattr(os, "link"), reason="hard links")
@pytest.mark.parametrize("verify", ["size", "md5"])
def test_a_hard_link_to_the_source_in_the_destination_is_refused_and_the_source_kept(driver, tmp_path, verify):
    src = tmp_path / "src"
    dst = tmp_path / "dst"
    src.mkdir()
    dst.mkdir()
    clip = src / "bars.bin"
    clip.write_bytes(os.urandom(200_000))
    before = md5(clip)
    os.link(clip, dst / "bars.bin")
    row = ingest_file(driver(), clip, dst, verify)
    assert clip.stat().st_size == 200_000
    assert md5(clip) == before
    assert row["status"] == "failed", row
    assert "onto itself" in str(row["error"])


def test_a_folder_is_not_copied_into_a_new_folder_inside_itself(driver, tmp_path):
    root = card(tmp_path)
    dest = root / "backup"
    row = ingest(driver(), root, dest, "size")
    assert row["status"] == "failed", row
    assert "inside the folder being copied" in str(row["error"])
    assert not (dest / "CARD").exists()


def test_a_copy_over_an_older_file_leaves_no_part_file(driver, tmp_path):
    root = card(tmp_path)
    dest = tmp_path / "dest"
    (dest / "CARD" / "DCIM" / "100").mkdir(parents=True)
    (dest / "CARD" / "DCIM" / "100" / "A001.bin").write_bytes(b"old")
    row = ingest(driver(), root, dest, "md5")
    assert row["status"] == "done", row
    assert md5(dest / "CARD" / "DCIM" / "100" / "A001.bin") == md5(root / "DCIM" / "100" / "A001.bin")
    assert sorted(p.name for p in (dest / "CARD" / "DCIM" / "100").iterdir()) == ["A001.bin", "A002.bin"]


@pytest.mark.skipif(not hasattr(os, "symlink"), reason="symbolic links")
def test_a_stale_part_file_link_is_replaced_not_written_through(driver, tmp_path):
    src = tmp_path / "src"
    dst = tmp_path / "dst"
    src.mkdir()
    dst.mkdir()
    clip = src / "bars.bin"
    clip.write_bytes(os.urandom(200_000))
    victim = tmp_path / "victim.txt"
    victim.write_bytes(b"keep me")
    d = driver()
    added = d.run("ingest.copy", paths=[str(clip)], destination=str(dst), verify="md5", start=False)
    item = added["items"][0]
    rows = d.run("queue.list")
    oid = next(o["id"] for it in rows["items"] if it["id"] == item for o in it["outputs"])
    os.symlink(victim, dst / f".bars.bin.{oid}.fe-part")
    d.run("queue.start")
    row = d.finish(oid)
    assert row["status"] == "done", row
    assert victim.read_bytes() == b"keep me"
    assert not (dst / "bars.bin").is_symlink()
    assert md5(dst / "bars.bin") == md5(clip)
    assert sorted(p.name for p in dst.iterdir()) == ["bars.bin"]


def test_a_stopped_copy_leaves_no_part_file_and_keeps_the_old_destination(driver, tmp_path):
    src = tmp_path / "src"
    dst = tmp_path / "dst"
    src.mkdir()
    dst.mkdir()
    clip = src / "big.bin"
    with open(clip, "wb") as f:
        f.truncate(400_000_000)
    (dst / "big.bin").write_bytes(b"old")
    d = driver()
    added = d.run("ingest.copy", paths=[str(clip)], destination=str(dst), verify="size", start=True)
    item = added["items"][0]
    rows = d.run("queue.list")
    oid = next(o["id"] for it in rows["items"] if it["id"] == item for o in it["outputs"])
    assert d.pump(lambda: any(dst.glob(".*.fe-part")), 30, step=0.001)
    d.run("queue.stop")
    row = d.finish(oid)
    assert row["status"] == "stopped", row
    assert (dst / "big.bin").read_bytes() == b"old"
    assert sorted(p.name for p in dst.iterdir()) == ["big.bin"]
