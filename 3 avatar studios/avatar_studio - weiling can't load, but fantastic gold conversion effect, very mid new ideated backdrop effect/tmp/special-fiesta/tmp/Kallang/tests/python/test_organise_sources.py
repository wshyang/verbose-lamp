import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
from organise_sources import group_by_hash, sha256_of  # noqa: E402


def write(tmp: Path, name: str, data: bytes) -> Path:
    path = tmp / name
    path.write_bytes(data)
    return path


def test_sha256_matches_stdlib(tmp_path):
    path = write(tmp_path, "a.bin", b"pixel-art")
    assert sha256_of(path) == hashlib.sha256(b"pixel-art").hexdigest()


def test_exact_duplicates_group_together(tmp_path):
    a = write(tmp_path, "a.bin", b"same-bytes")
    b = write(tmp_path, "b (1).bin", b"same-bytes")
    c = write(tmp_path, "c.bin", b"different")
    groups = group_by_hash([a, b, c])
    assert sorted(len(v) for v in groups.values()) == [1, 2]
