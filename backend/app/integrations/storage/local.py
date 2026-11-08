import contextlib
import os
import re
import tempfile
import uuid
from pathlib import Path
from typing import BinaryIO

from app.integrations.storage.base import FileNotFoundInStorage, StorageError

# A key is exactly what uuid.uuid4().hex produces. Anything else (slashes, dots, "..", drive
# letters, null bytes, uppercase, other lengths) is refused, so a key can never leave the folder.
_KEY_PATTERN = re.compile(r"^[0-9a-f]{32}$")
_CHUNK_BYTES = 64 * 1024


def new_key() -> str:
    return uuid.uuid4().hex


class LocalFileStorage:
    """Files on local disk under one private folder, named only by their random key.

    The folder must be outside any publicly served directory. Writes go to a temporary
    file first and are renamed into place, so a failed upload never leaves a half-written file
    under a real key.
    """

    def __init__(self, root: Path) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        if not isinstance(key, str) or not _KEY_PATTERN.fullmatch(key):
            raise StorageError("Invalid storage key")
        path = (self.root / key).resolve()
        if path.parent != self.root:  # belt and braces: symlinks or odd filesystems
            raise StorageError("Invalid storage key")
        return path

    def save(self, key: str, stream: BinaryIO) -> int:
        target = self._path(key)
        descriptor, temp_name = tempfile.mkstemp(dir=self.root, prefix=".upload-")
        try:
            with os.fdopen(descriptor, "wb") as temp:
                size = _copy(stream, temp)
            os.replace(temp_name, target)  # atomic on the same volume
        except BaseException:
            with contextlib.suppress(OSError):
                Path(temp_name).unlink()
            raise
        return size

    def open(self, key: str) -> BinaryIO:
        path = self._path(key)
        try:
            return path.open("rb")
        except FileNotFoundError:
            raise FileNotFoundInStorage("File not found") from None
        except OSError as exc:
            raise StorageError(f"Could not open file: {type(exc).__name__}") from None

    def delete(self, key: str) -> None:
        path = self._path(key)
        try:
            path.unlink(missing_ok=True)
        except OSError as exc:
            raise StorageError(f"Could not delete file: {type(exc).__name__}") from None


def _copy(source: BinaryIO, destination: BinaryIO) -> int:
    total = 0
    while chunk := source.read(_CHUNK_BYTES):
        destination.write(chunk)
        total += len(chunk)
    return total
