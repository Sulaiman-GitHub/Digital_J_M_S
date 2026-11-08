"""Security helpers: email normalisation, password hashing and policy, random tokens."""

import hashlib
import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.common_passwords import COMMON_PASSWORDS

PASSWORD_MIN_LENGTH = 8
# Upper bound so nobody can make the server hash megabytes of input.
PASSWORD_MAX_LENGTH = 128

# argon2id with the library's recommended defaults. Tests swap in cheaper params.
_hasher = PasswordHasher()
# Verified against when the email is unknown, so both paths take about the same time.
_DUMMY_HASH = _hasher.hash("timing-equaliser-not-a-real-password")


def normalise_email(email: str) -> str:
    """The form used for uniqueness and lookups: surrounding whitespace removed, lowercase.

    The original spelling is kept separately in users.email for display.
    """
    return email.strip().lower()


# ---------- passwords ----------


def password_problem(password: str, email: str | None = None) -> str | None:
    """A message saying what is wrong with a new password, or None if it is acceptable."""
    if len(password) < PASSWORD_MIN_LENGTH:
        return f"Use at least {PASSWORD_MIN_LENGTH} characters."
    if len(password) > PASSWORD_MAX_LENGTH:
        return f"Use at most {PASSWORD_MAX_LENGTH} characters."
    if password.strip().lower() in COMMON_PASSWORDS:
        return "This password is too common. Choose one that is harder to guess."
    if email:
        normalised = normalise_email(email)
        local_part = normalised.split("@", 1)[0]
        if password.strip().lower() in {normalised, local_part}:
            return "Do not use your email address as your password."
    return None


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    """True if the password matches. With no hash (unknown user) a dummy check still runs."""
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    """True when the stored hash uses older parameters and should be upgraded at login."""
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


# ---------- random tokens (sessions, CSRF, email links) ----------


def generate_token() -> str:
    """256 bits of randomness, URL-safe."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """SHA-256 hex digest. Only this is stored; the raw token goes to the user once."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def tokens_match(a: str, b: str) -> bool:
    """Constant-time comparison."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))
