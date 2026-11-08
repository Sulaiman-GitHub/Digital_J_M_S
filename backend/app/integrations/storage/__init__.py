"""File storage behind the FileStorage interface."""

from app.integrations.storage.base import FileNotFoundInStorage, FileStorage, StorageError
from app.integrations.storage.factory import get_file_storage, storage_directory
from app.integrations.storage.local import LocalFileStorage, new_key

__all__ = [
    "FileNotFoundInStorage",
    "FileStorage",
    "LocalFileStorage",
    "StorageError",
    "get_file_storage",
    "new_key",
    "storage_directory",
]
