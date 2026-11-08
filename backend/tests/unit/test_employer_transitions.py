"""The verification state machine as a pure table."""

from itertools import product

import pytest

from app.models import UserRole, VerificationStatus
from app.services.employers import (
    REASON_REQUIRED,
    TRANSITIONS,
    can_publish,
    transition_allowed,
)

S = VerificationStatus

ALLOWED = [
    (S.DRAFT, S.PENDING, UserRole.EMPLOYER),
    (S.REJECTED, S.PENDING, UserRole.EMPLOYER),
    (S.APPROVED, S.PENDING, UserRole.EMPLOYER),  # edited a key field
    (S.PENDING, S.APPROVED, UserRole.ADMIN),
    (S.PENDING, S.REJECTED, UserRole.ADMIN),
    (S.APPROVED, S.SUSPENDED, UserRole.ADMIN),
    (S.SUSPENDED, S.APPROVED, UserRole.ADMIN),
]


@pytest.mark.parametrize(("from_status", "to_status", "role"), ALLOWED)
def test_every_allowed_transition(from_status: S, to_status: S, role: UserRole) -> None:
    assert transition_allowed(from_status, to_status, role) is True


def test_the_table_lists_exactly_the_allowed_transitions() -> None:
    assert {(a, b): role for a, b, role in ALLOWED} == TRANSITIONS


@pytest.mark.parametrize(
    ("from_status", "to_status", "role"),
    [(a, b, role) for a, b, role in product(S, S, UserRole) if (a, b, role) not in ALLOWED],
)
def test_every_other_combination_is_refused(from_status: S, to_status: S, role: UserRole) -> None:
    assert transition_allowed(from_status, to_status, role) is False


@pytest.mark.parametrize("status", list(S))
def test_staying_in_the_same_status_is_never_a_transition(status: S) -> None:
    for role in UserRole:
        assert transition_allowed(status, status, role) is False


def test_an_employer_can_never_approve_reject_or_suspend() -> None:
    for status, target in product(S, (S.APPROVED, S.REJECTED, S.SUSPENDED)):
        if status == S.SUSPENDED and target == S.APPROVED:
            assert transition_allowed(status, target, UserRole.EMPLOYER) is False
        assert transition_allowed(status, target, UserRole.EMPLOYER) is False


def test_nobody_can_move_back_to_draft() -> None:
    for status, role in product(S, UserRole):
        assert transition_allowed(status, S.DRAFT, role) is False


def test_reject_and_suspend_need_a_reason_and_nothing_else_does() -> None:
    assert REASON_REQUIRED == {S.REJECTED, S.SUSPENDED}


@pytest.mark.parametrize("status", list(S))
def test_only_an_approved_employer_can_publish(status: S) -> None:
    class Stub:
        verification_status = status

    assert can_publish(Stub()) is (status == S.APPROVED)  # type: ignore[arg-type]
