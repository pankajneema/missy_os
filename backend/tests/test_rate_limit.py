import pytest

from app.core import rate_limit


@pytest.fixture(autouse=True)
def _clear_state():
    """Module-level state persists across tests (it's a process-wide,
    in-memory tracker by design - see rate_limit.py) - reset it so tests
    don't interfere with each other regardless of execution order."""
    rate_limit._failed_attempts.clear()
    rate_limit._locked_until.clear()
    yield
    rate_limit._failed_attempts.clear()
    rate_limit._locked_until.clear()


def test_not_locked_out_with_no_failures():
    locked, remaining = rate_limit.is_locked_out("alice")
    assert locked is False
    assert remaining == 0


def test_not_locked_out_below_the_threshold():
    for _ in range(rate_limit._MAX_ATTEMPTS - 1):
        rate_limit.record_failure("alice")

    locked, _ = rate_limit.is_locked_out("alice")
    assert locked is False


def test_locked_out_at_the_threshold():
    for _ in range(rate_limit._MAX_ATTEMPTS):
        rate_limit.record_failure("alice")

    locked, remaining = rate_limit.is_locked_out("alice")
    assert locked is True
    assert remaining > 0


def test_lockout_expires_after_the_window():
    now = 1_000_000.0
    for _ in range(rate_limit._MAX_ATTEMPTS):
        rate_limit.record_failure("alice", now=now)

    locked_during, _ = rate_limit.is_locked_out("alice", now=now + 1)
    locked_after, remaining_after = rate_limit.is_locked_out("alice", now=now + rate_limit._LOCKOUT_SECONDS + 1)

    assert locked_during is True
    assert locked_after is False
    assert remaining_after == 0


def test_record_success_clears_prior_failures():
    for _ in range(rate_limit._MAX_ATTEMPTS - 1):
        rate_limit.record_failure("alice")

    rate_limit.record_success("alice")

    for _ in range(rate_limit._MAX_ATTEMPTS - 1):
        rate_limit.record_failure("alice")
    locked, _ = rate_limit.is_locked_out("alice")

    assert locked is False  # the earlier failures were cleared, not carried over


def test_failures_outside_the_window_dont_count():
    now = 1_000_000.0
    rate_limit.record_failure("alice", now=now)
    # A gap longer than the window before the remaining attempts.
    later = now + rate_limit._WINDOW_SECONDS + 1
    for _ in range(rate_limit._MAX_ATTEMPTS - 1):
        rate_limit.record_failure("alice", now=later)

    locked, _ = rate_limit.is_locked_out("alice", now=later)
    assert locked is False  # only _MAX_ATTEMPTS-1 failures are within the window now


def test_usernames_are_tracked_independently():
    for _ in range(rate_limit._MAX_ATTEMPTS):
        rate_limit.record_failure("alice")

    locked_alice, _ = rate_limit.is_locked_out("alice")
    locked_bob, _ = rate_limit.is_locked_out("bob")

    assert locked_alice is True
    assert locked_bob is False
