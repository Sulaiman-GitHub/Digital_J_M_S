import io
from pathlib import Path

import pytest

from app.core.config import BACKEND_DIR, Settings
from app.integrations.storage import (
    FileNotFoundInStorage,
    LocalFileStorage,
    StorageError,
    get_file_storage,
    new_key,
    storage_directory,
)


@pytest.fixture
def storage(tmp_path: Path) -> LocalFileStorage:
    return LocalFileStorage(tmp_path / "files")


def test_keys_are_random_32_character_hex() -> None:
    keys = {new_key() for _ in range(50)}

    assert len(keys) == 50
    assert all(len(k) == 32 and int(k, 16) >= 0 for k in keys)


def test_save_open_and_delete_round_trip(storage: LocalFileStorage) -> None:
    key = new_key()
    data = b"hello " * 50_000  # 300 KB: more than one copy chunk

    written = storage.save(key, io.BytesIO(data))

    assert written == len(data)
    with storage.open(key) as handle:
        assert handle.read() == data
    storage.delete(key)
    with pytest.raises(FileNotFoundInStorage):
        storage.open(key)


def test_the_folder_is_created_and_files_are_named_only_by_their_key(tmp_path: Path) -> None:
    root = tmp_path / "does" / "not" / "exist" / "yet"
    storage = LocalFileStorage(root)
    key = new_key()

    storage.save(key, io.BytesIO(b"x"))

    assert [p.name for p in root.iterdir()] == [key]


def test_deleting_a_missing_file_is_not_an_error(storage: LocalFileStorage) -> None:
    storage.delete(new_key())


def test_opening_a_missing_file_raises_a_clear_error(storage: LocalFileStorage) -> None:
    with pytest.raises(FileNotFoundInStorage):
        storage.open(new_key())


@pytest.mark.parametrize(
    "bad_key",
    [
        "../secret",
        "..\\secret",
        "a/b",
        "/etc/passwd",
        "C:\\Windows\\win.ini",
        "..",
        ".",
        "",
        "a" * 31,
        "a" * 33,
        "A" * 32,  # upper case is not what uuid hex produces
        "g" * 32,  # not hex
        ("a" * 31) + "\x00",
        "a" * 32 + "/../x",
        "%2e%2e%2f" + "a" * 23,
    ],
)
def test_keys_that_could_leave_the_folder_are_refused_everywhere(
    storage: LocalFileStorage, tmp_path: Path, bad_key: str
) -> None:
    outside = tmp_path / "secret"
    outside.write_text("do not touch")

    for action in (
        lambda: storage.save(bad_key, io.BytesIO(b"x")),
        lambda: storage.open(bad_key),
        lambda: storage.delete(bad_key),
    ):
        with pytest.raises(StorageError, match="Invalid storage key"):
            action()

    assert outside.read_text() == "do not touch"
    assert not any(storage.root.iterdir())  # nothing was created in the storage folder either


def test_a_failed_save_leaves_no_file_behind(storage: LocalFileStorage) -> None:
    class BrokenStream(io.BytesIO):
        calls = 0

        def read(self, size: int = -1) -> bytes:
            BrokenStream.calls += 1
            if BrokenStream.calls > 1:
                raise OSError("disk went away")
            return b"x" * 1000

    key = new_key()

    with pytest.raises(OSError):
        storage.save(key, BrokenStream())

    assert list(storage.root.iterdir()) == []  # neither the key nor a temporary file


def test_saving_the_same_key_again_replaces_the_file_atomically(
    storage: LocalFileStorage,
) -> None:
    key = new_key()
    storage.save(key, io.BytesIO(b"first"))

    storage.save(key, io.BytesIO(b"second"))

    with storage.open(key) as handle:
        assert handle.read() == b"second"
    assert len(list(storage.root.iterdir())) == 1


def test_the_relative_storage_folder_is_taken_from_the_backend_folder(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    relative = Settings(_env_file=None, app_env="development", storage_local_dir="./storage")  # type: ignore[call-arg]
    absolute = Settings(  # type: ignore[call-arg]
        _env_file=None, app_env="development", storage_local_dir=str(tmp_path / "abs")
    )

    assert storage_directory(relative) == BACKEND_DIR / "storage"
    assert storage_directory(absolute) == tmp_path / "abs"
    # ...whatever folder the shell happens to be in
    monkeypatch.chdir(tmp_path)
    assert storage_directory(relative) == BACKEND_DIR / "storage"


def test_the_factory_builds_local_storage_from_settings(tmp_path: Path) -> None:
    settings = Settings(  # type: ignore[call-arg]
        _env_file=None,
        app_env="development",
        storage_backend="local",
        storage_local_dir=str(tmp_path / "from-settings"),
    )

    storage = get_file_storage(settings)

    assert isinstance(storage, LocalFileStorage)
    assert (tmp_path / "from-settings").is_dir()
