from typing import BinaryIO, Protocol


class StorageError(Exception):
    """A storage operation failed. The message is safe to log; it never holds file contents."""


class FileNotFoundInStorage(StorageError):
    pass


class FileStorage(Protocol):
    """Where uploaded files live. Keys are random and never come from users."""

    def save(self, key: str, stream: BinaryIO) -> int:
        """Store the stream's bytes under `key` and return how many bytes were written."""
        ...

    def open(self, key: str) -> BinaryIO:
        """A binary file object for reading. Raises FileNotFoundInStorage if there is none."""
        ...

    def delete(self, key: str) -> None:
        """Remove the file. Not an error if it is already gone."""
        ...
