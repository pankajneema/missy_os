from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.repositories import user_repo


def register(db: Session, username: str, password: str) -> User:
    if user_repo.get_by_username(db, username) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")
    return user_repo.create(db, username=username, password_hash=hash_password(password))


def authenticate(db: Session, username: str, password: str) -> str:
    user = user_repo.get_by_username(db, username)
    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    return create_access_token(user.id)
