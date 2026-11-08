"""Each test runs in a transaction that is rolled back, even when app code calls commit().

The two tests below are deliberately a pair: the first writes and commits, the second (run
after it, pytest keeps file order) checks that nothing survived.
"""

from sqlalchemy import text
from sqlalchemy.orm import Session

PROBE_TABLE = "isolation_probe"


def _probe_exists(db_session: Session) -> bool:
    found = db_session.execute(text(f"SELECT to_regclass('public.{PROBE_TABLE}')")).scalar()
    return found is not None


def test_1_writes_and_commits_inside_the_test_transaction(db_session: Session) -> None:
    db_session.execute(text(f"CREATE TABLE {PROBE_TABLE} (value text NOT NULL)"))
    db_session.execute(text(f"INSERT INTO {PROBE_TABLE} (value) VALUES ('from test 1')"))
    db_session.commit()  # what route code does through get_db

    assert _probe_exists(db_session)
    assert db_session.execute(text(f"SELECT count(*) FROM {PROBE_TABLE}")).scalar() == 1


def test_2_sees_nothing_from_the_previous_test(db_session: Session) -> None:
    assert not _probe_exists(db_session)
