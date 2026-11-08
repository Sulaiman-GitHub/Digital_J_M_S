import io

import pytest

from app.services.cv_files import (
    MAX_FILENAME_LENGTH,
    clean_filename,
    content_matches,
    split_extension,
)
from tests.sample_files import (
    PLAIN_TEXT,
    WINDOWS_EXE,
    make_doc,
    make_docx,
    make_pdf,
    make_xlsx,
    make_zip_without_content_types,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("cv.pdf", "cv.pdf"),
        ("Nakato Sarah CV.docx", "Nakato Sarah CV.docx"),
        ("../../../etc/passwd.pdf", "passwd.pdf"),
        ("..\\..\\windows\\system32\\cv.pdf", "cv.pdf"),
        ("C:\\Users\\sula\\My CV.pdf", "My CV.pdf"),
        ("/var/www/html/cv.pdf", "cv.pdf"),
        ("folder/", ""),
        ("....//cv.pdf", "cv.pdf"),
        ("  cv.pdf  ", "cv.pdf"),
        ("cv.pdf.", "cv.pdf"),
        ("cv.pdf ...", "cv.pdf"),
        (".hidden.pdf", "hidden.pdf"),
        ("cv\x00.pdf", "cv.pdf"),
        ("cv\x07\x1b[31m.pdf", "cv[31m.pdf"),
        ("line\nbreak\r.pdf", "line break.pdf"),
        ("tab\tseparated  name.pdf", "tab separated name.pdf"),
        ('my "best" cv.pdf', "my _best_ cv.pdf"),
        ("a<b>c:d|e?f*g.pdf", "a_b_c_d_e_f_g.pdf"),
        ("cv\u202efdp.exe", "cvfdp.exe"),  # right-to-left override removed: no disguised .exe
        ("cv\u200b.pdf", "cv.pdf"),  # zero-width space removed
        ("Résumé Nakato.pdf", "Résumé Nakato.pdf"),
        ("简历.pdf", "简历.pdf"),
        ("", ""),
        (None, ""),
        ("....", ""),
        ("\x00\x01", ""),
    ],
)
def test_clean_filename(raw: str | None, expected: str) -> None:
    assert clean_filename(raw) == expected


def test_a_cleaned_name_never_holds_anything_dangerous() -> None:
    nasty = '../..\\ \x00\x1f\u202e\u2028\u2029:*?"<>|\r\n\t/cv.pdf'

    cleaned = clean_filename(nasty)

    assert cleaned == "cv.pdf"
    for forbidden in ("/", "\\", "\x00", "\r", "\n", "\t", '"', "<", ">", "|", "?", "*", ":"):
        assert forbidden not in cleaned


def test_long_names_are_shortened_but_keep_their_extension() -> None:
    cleaned = clean_filename("a" * 400 + ".pdf")

    assert len(cleaned) == MAX_FILENAME_LENGTH
    assert cleaned.endswith(".pdf")


def test_a_long_name_without_an_extension_is_just_cut() -> None:
    assert len(clean_filename("b" * 400)) == MAX_FILENAME_LENGTH


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("cv.pdf", ("cv", "pdf")),
        ("cv.PDF", ("cv", "pdf")),
        ("my.cv.docx", ("my.cv", "docx")),
        ("cv.pdf.exe", ("cv.pdf", "exe")),
        ("cv", ("cv", None)),
        (".pdf", (".pdf", None)),
        ("cv.", ("cv.", None)),
        ("", ("", None)),
    ],
)
def test_split_extension(name: str, expected: tuple[str, str | None]) -> None:
    assert split_extension(name) == expected


# ---------- contents ----------


def check(extension: str, data: bytes) -> bool:
    return content_matches(extension, io.BytesIO(data))


def test_real_files_match_their_extension() -> None:
    assert check("pdf", make_pdf())
    assert check("docx", make_docx())
    assert check("doc", make_doc())


@pytest.mark.parametrize(
    ("extension", "data"),
    [
        ("pdf", WINDOWS_EXE),
        ("pdf", PLAIN_TEXT),
        ("pdf", b""),
        ("pdf", b"%PD"),  # truncated header
        ("pdf", b" %PDF-1.4"),  # not at the very start
        ("pdf", make_docx()),
        ("doc", make_pdf()),
        ("doc", make_docx()),
        ("doc", PLAIN_TEXT),
        ("doc", bytes.fromhex("D0CF11E0A1B11A")),  # one byte short
        ("docx", make_pdf()),
        ("docx", make_doc()),
        ("docx", WINDOWS_EXE),
        ("docx", make_xlsx()),  # a zip with [Content_Types].xml, but not a Word document
        ("docx", make_zip_without_content_types()),
        ("docx", make_docx()[:60]),  # truncated zip
        ("docx", b"PK\x03\x04" + b"garbage" * 20),  # right start, not a real archive
        ("exe", WINDOWS_EXE),
        ("", make_pdf()),
    ],
)
def test_files_that_do_not_match_are_refused(extension: str, data: bytes) -> None:
    assert check(extension, data) is False


def test_the_stream_is_rewound_after_checking() -> None:
    stream = io.BytesIO(make_docx())

    assert content_matches("docx", stream) is True
    assert stream.tell() == 0
    stream.read(10)
    assert content_matches("docx", stream) is True  # position at the time does not matter
    assert stream.tell() == 0

    refused = io.BytesIO(WINDOWS_EXE)
    assert content_matches("pdf", refused) is False
    assert refused.tell() == 0


def test_a_docx_is_only_listed_never_unpacked() -> None:
    # A tiny archive that would be huge if unpacked: the check must still be quick and safe.
    import zipfile

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", "0" * 50_000_000)  # compresses to a few KB

    assert len(buffer.getvalue()) < 200_000
    assert check("docx", buffer.getvalue()) is True
