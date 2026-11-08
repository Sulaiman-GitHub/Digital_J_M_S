from pathlib import Path

from app.core.config import BACKEND_DIR, Settings, get_settings
from app.integrations.storage.base import FileStorage
from app.integrations.storage.local import LocalFileStorage


def storage_directory(settings: Settings) -> Path:
    """STORAGE_LOCAL_DIR; a relative path is taken from the backend folder, not the shell's cwd."""
    path = Path(settings.storage_local_dir)
    return path if path.is_absolute() else BACKEND_DIR / path


def get_file_storage(settings: Settings | None = None) -> FileStorage:
    """The storage chosen by STORAGE_BACKEND (only "local" exists so far)."""
    settings = settings or get_settings()
    match settings.storage_backend:
        case _:
            return LocalFileStorage(storage_directory(settings))
