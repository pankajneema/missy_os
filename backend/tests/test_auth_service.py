import pytest
from fastapi import HTTPException

from app.core import rate_limit
from app.models.user import User
from app.services import auth_service


@pytest.fixture(autouse=True)
def _clear_rate_limit_state():
    rate_limit._failed_attempts.clear()
    rate_limit._locked_until.clear()
    yield
    rate_limit._failed_attempts.clear()
    rate_limit._locked_until.clear()


def test_authenticate_succeeds_with_the_right_password(db, user: User):
    token = auth_service.authenticate(db, user.username, "x")
    assert token


def test_authenticate_rejects_the_wrong_password(db, user: User):
    with pytest.raises(HTTPException) as exc_info:
        auth_service.authenticate(db, user.username, "wrong")
    assert exc_info.value.status_code == 401


def test_repeated_failures_lock_out_the_username(db, user: User):
    for _ in range(rate_limit._MAX_ATTEMPTS):
        with pytest.raises(HTTPException) as exc_info:
            auth_service.authenticate(db, user.username, "wrong")
        assert exc_info.value.status_code == 401

    # Locked out now - even the CORRECT password is rejected until it clears.
    with pytest.raises(HTTPException) as exc_info:
        auth_service.authenticate(db, user.username, "x")
    assert exc_info.value.status_code == 429


def test_a_successful_login_clears_the_failure_count(db, user: User):
    for _ in range(rate_limit._MAX_ATTEMPTS - 1):
        with pytest.raises(HTTPException):
            auth_service.authenticate(db, user.username, "wrong")

    auth_service.authenticate(db, user.username, "x")  # succeeds, clears the counter

    with pytest.raises(HTTPException) as exc_info:
        auth_service.authenticate(db, user.username, "wrong")
    assert exc_info.value.status_code == 401  # not 429 - the prior failures didn't carry over
