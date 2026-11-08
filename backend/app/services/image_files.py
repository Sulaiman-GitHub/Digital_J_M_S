"""Checking uploaded images (profile photos and company logos). Pure functions.

The file's own bytes decide what it is, never its name or the client's content type. Only three
formats are accepted: JPEG, PNG and WebP. SVG is refused on purpose (it can carry scripts).
"""

from dataclasses import dataclass
from typing import BinaryIO

JPEG_MAGIC = b"\xff\xd8\xff"
PNG_MAGIC = bytes.fromhex("89504E470D0A1A0A")


@dataclass(frozen=True)
class ImageType:
    extension: str
    content_type: str
    label: str


JPEG = ImageType("jpg", "image/jpeg", "JPEG")
PNG = ImageType("png", "image/png", "PNG")
WEBP = ImageType("webp", "image/webp", "WebP")


def detect_image_type(stream: BinaryIO) -> ImageType | None:
    """The image type from the first bytes, or None when it is not a JPEG, PNG or WebP.
    Rewinds the stream after."""
    stream.seek(0)
    head = stream.read(12)
    stream.seek(0)
    if head.startswith(JPEG_MAGIC):
        return JPEG
    if head.startswith(PNG_MAGIC):
        return PNG
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return WEBP
    return None
