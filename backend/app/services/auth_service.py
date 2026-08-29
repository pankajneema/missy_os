from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core import rate_limit
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.repositories import user_repo


def register(db: Session, username: str, password: str) -> User:
    if user_repo.get_by_username(db, username) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")
    return user_repo.create(db, username=username, password_hash=hash_password(password))


def authenticate(db: Session, username: str, password: str) -> str:
    # Checked before touching the DB/bcrypt at all - a locked-out username
    # should fail fast and identically whether or not it actually exists,
    # same reasoning as the generic error message below.
    locked, retry_after = rate_limit.is_locked_out(username)
    if locked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts - try again in {retry_after} seconds.",
        )

    user = user_repo.get_by_username(db, username)
    if user is None or not verify_password(password, user.password_hash):
        rate_limit.record_failure(username)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    rate_limit.record_success(username)
    return create_access_token(user.id)
