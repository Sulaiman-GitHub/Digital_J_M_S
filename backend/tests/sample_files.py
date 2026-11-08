"""Small but structurally real sample files for CV tests."""

import io
import zipfile

CONTENT_TYPES_XML = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'
)


def _add(archive: zipfile.ZipFile, name: str, data: str) -> None:
    """Add a file with a fixed timestamp, so the same call always gives the same bytes. (writestr
    with a plain name stamps the current time, and two files made a second apart then differ.)"""
    info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
    info.compress_type = archive.compression
    archive.writestr(info, data)


def make_pdf(pad_to: int = 0) -> bytes:
    body = (
        b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n"
        b"trailer\n<< /Root 1 0 R >>\n%%EOF\n"
    )
    return body + b"\n" * max(0, pad_to - len(body))


def make_docx(extra_name: str | None = None) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        _add(archive, "[Content_Types].xml", CONTENT_TYPES_XML)
        _add(archive, "_rels/.rels", "<Relationships/>")
        _add(archive, "word/document.xml", "<w:document/>")
        if extra_name:
            _add(archive, extra_name, "x")
    return buffer.getvalue()


def make_xlsx() -> bytes:
    """A zip with [Content_Types].xml like a .docx, but a spreadsheet inside."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        _add(archive, "[Content_Types].xml", CONTENT_TYPES_XML)
        _add(archive, "xl/workbook.xml", "<workbook/>")
    return buffer.getvalue()


def make_zip_without_content_types() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        _add(archive, "word/document.xml", "<w:document/>")
    return buffer.getvalue()


def make_doc() -> bytes:
    """An OLE2 container header (what a .doc starts with) followed by padding."""
    return bytes.fromhex("D0CF11E0A1B11AE1") + b"\x00" * 504


WINDOWS_EXE = b"MZ\x90\x00\x03\x00\x00\x00" + b"\x00" * 200
PLAIN_TEXT = b"Nakato Sarah\nAccounting graduate\n"


def make_png(pad_to: int = 0) -> bytes:
    """The 8-byte PNG signature and a tiny IHDR; enough for the content check."""
    body = bytes.fromhex("89504E470D0A1A0A") + b"\x00\x00\x00\rIHDR" + b"\x00" * 17
    return body + b"\x00" * max(0, pad_to - len(body))


def make_jpeg() -> bytes:
    return bytes.fromhex("FFD8FFE000104A46494600") + b"\x00" * 64 + bytes.fromhex("FFD9")


def make_webp() -> bytes:
    return b"RIFF" + (4).to_bytes(4, "little") + b"WEBP" + b"\x00" * 16


SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
