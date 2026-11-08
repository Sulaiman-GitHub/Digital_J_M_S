"""Checking uploaded CV files: names, types and contents. Pure functions, no I/O
beyond reading the stream you give them."""

import re
import unicodedata
import zipfile
from dataclasses import dataclass
from typing import BinaryIO

MAX_FILENAME_LENGTH = 255
FALLBACK_STEM = "cv"

PDF_MAGIC = b"%PDF"
# The OLE2 container that old .doc files (and also .xls and .ppt) start with.
OLE_MAGIC = bytes.fromhex("D0CF11E0A1B11AE1")
ZIP_MAGIC = b"PK"


@dataclass(frozen=True)
class CvKind:
    extension: str
    content_type: str
    label: str


KINDS: dict[str, CvKind] = {
    "pdf": CvKind("pdf", "application/pdf", "PDF"),
    "doc": CvKind("doc", "application/msword", "Word"),
    "docx": CvKind(
        "docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Word",
    ),
}

_PATH_SEPARATORS = re.compile(r"[\\/]")
_AWKWARD = re.compile(r'[<>:"|?*]')
_WHITESPACE = re.compile(r"\s+")


def clean_filename(raw: str | None) -> str:
    """A safe name to show and to offer for download. May be empty if nothing usable is left.

    - drops any folder part, so "../../etc/passwd.pdf" and "C:\\x\\cv.pdf" become the file name only
    - removes control and invisible characters (including the right-to-left override that is
      used to disguise "cv.exe" as "cv.pdf")
    - replaces characters that are awkward in file names and headers
    - trims spaces and dots at both ends, and shortens to 255 characters keeping the extension
    """
    if not raw:
        return ""
    name = _PATH_SEPARATORS.split(unicodedata.normalize("NFC", raw))[-1]
    # Tabs, line breaks and the like become ordinary spaces first, so words are not glued together.
    name = "".join(" " if char.isspace() else char for char in name)
    # Whatever is still in a "C" category is control, format (bidi marks), surrogate, private
    # or unassigned: dropped.
    name = "".join(char for char in name if unicodedata.category(char)[0] != "C")
    name = _AWKWARD.sub("_", name)
    name = _WHITESPACE.sub(" ", name).strip(" .")
    # "name .pdf" (a removed character left a space before the dot) becomes "name.pdf".
    stem, dot, extension = name.rpartition(".")
    if dot and stem and " " not in extension:
        name = f"{stem.rstrip(' .')}.{extension}"
    if len(name) > MAX_FILENAME_LENGTH:
        stem, dot, extension = name.rpartition(".")
        if dot and 0 < len(extension) <= 10:
            name = f"{stem[: MAX_FILENAME_LENGTH - len(extension) - 1].rstrip(' .')}.{extension}"
        else:
            name = name[:MAX_FILENAME_LENGTH].rstrip(" .")
    return name


def split_extension(clean_name: str) -> tuple[str, str | None]:
    """("cv", "pdf") for "cv.PDF"; extension is lower case, or None when there is none."""
    stem, dot, extension = clean_name.rpartition(".")
    if not dot or not stem or not extension:
        return clean_name, None
    return stem, extension.lower()


def _is_docx(stream: BinaryIO) -> bool:
    try:
        with zipfile.ZipFile(stream) as archive:  # reads only the file list, never unpacks
            names = set(archive.namelist())
    except (zipfile.BadZipFile, OSError, ValueError, EOFError):
        return False
    return "[Content_Types].xml" in names and "word/document.xml" in names


def content_matches(extension: str, stream: BinaryIO) -> bool:
    """Does the file really look like what its extension claims? Rewinds the stream after.

    Limits, stated honestly: a .doc check accepts any OLE2 file (an old .xls renamed to .doc
    passes), and nothing here scans for viruses or macros. The file is only stored and handed back.
    """
    stream.seek(0)
    head = stream.read(len(OLE_MAGIC))
    stream.seek(0)
    try:
        if extension == "pdf":
            return head.startswith(PDF_MAGIC)
        if extension == "doc":
            return head.startswith(OLE_MAGIC)
        if extension == "docx":
            return head.startswith(ZIP_MAGIC) and _is_docx(stream)
        return False
    finally:
        stream.seek(0)
