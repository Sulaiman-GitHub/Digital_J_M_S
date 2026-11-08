import pytest

from app.core import security
from app.core.security import (
    generate_token,
    hash_password,
    hash_token,
    password_needs_rehash,
    password_problem,
    tokens_match,
    verify_password,
)


@pytest.mark.parametrize(
    ("password", "email", "fragment"),
    [
        ("short1!", None, "at least 8"),
        ("x" * 129, None, "at most 128"),
        ("password123", None, "too common"),
        ("  PASSWORD@123 ", None, "too common"),
        ("12345678", None, "too common"),
        ("nakato.sarah", "Nakato.Sarah@example.com", "email address"),
        ("nakato.sarah@example.com", "Nakato.Sarah@example.com", "email address"),
    ],
)
def test_weak_passwords_are_refused_with_a_reason(
    password: str, email: str | None, fragment: str
) -> None:
    problem = password_problem(password, email)

    assert problem is not None and fragment in problem


@pytest.mark.parametrize("password", ["Kampala-Sunrise-42", "exactly8", "x" * 128])
def test_acceptable_passwords(password: str) -> None:
    assert password_problem(password, "nakato@example.com") is None


def test_hash_is_argon2id_and_verifies() -> None:
    hashed = hash_password("Kampala-Sunrise-42")

    assert hashed.startswith("$argon2id$")
    assert "Kampala-Sunrise-42" not in hashed
    assert verify_password(hashed, "Kampala-Sunrise-42") is True
    assert verify_password(hashed, "kampala-sunrise-42") is False


def test_verify_with_no_hash_is_false_even_for_the_dummy_password() -> None:
    assert verify_password(None, "timing-equaliser") is False
    assert verify_password(None, "anything") is False


def test_verify_tolerates_a_corrupt_hash() -> None:
    assert verify_password("not-a-hash", "whatever") is False


def test_hashes_with_old_parameters_need_rehash(monkeypatch: pytest.MonkeyPatch) -> None:
    current = hash_password("Kampala-Sunrise-42")
    assert password_needs_rehash(current) is False

    from argon2 import PasswordHasher

    monkeypatch.setattr(security, "_hasher", PasswordHasher(time_cost=2, memory_cost=16))
    assert password_needs_rehash(current) is True
    assert password_needs_rehash("garbage") is True


def test_tokens_are_random_urlsafe_and_long() -> None:
    tokens = {generate_token() for _ in range(50)}

    assert len(tokens) == 50
    assert all(len(t) >= 43 and "=" not in t and "/" not in t for t in tokens)


def test_hash_token_is_sha256_hex_and_stable() -> None:
    digest = hash_token("abc")

    assert digest == hash_token("abc")
    assert len(digest) == 64 and int(digest, 16) >= 0
    assert digest != hash_token("abd")


def test_tokens_match() -> None:
    assert tokens_match("same", "same") is True
    assert tokens_match("same", "diff") is False
