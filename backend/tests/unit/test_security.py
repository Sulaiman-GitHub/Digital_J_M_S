import pytest

from app.core.security import normalise_email


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("nakato@example.com", "nakato@example.com"),
        ("Nakato@Example.COM", "nakato@example.com"),
        ("  nakato@example.com\t\n", "nakato@example.com"),
        (" OKELLO.J@Mak.AC.UG ", "okello.j@mak.ac.ug"),
    ],
)
def test_normalise_email_trims_and_lowercases(raw: str, expected: str) -> None:
    assert normalise_email(raw) == expected


def test_normalise_email_is_idempotent() -> None:
    once = normalise_email("  Nakato@Example.com ")

    assert normalise_email(once) == once
