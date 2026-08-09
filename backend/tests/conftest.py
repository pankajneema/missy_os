import os
import subprocess
import uuid

# Must happen before any `app.*` import - app/db/session.py builds its engine
# from get_settings().database_url at import time, and pydantic-settings
# prioritizes real env vars over .env, so this redirects every test to a
# throwaway database instead of the real one.
os.environ["DATABASE_URL"] = "postgresql+psycopg2://missy:missy@localhost:5439/missy_os_test"

import pytest  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.models.assistant_profile import AssistantProfile  # noqa: E402
from app.models.user import User  # noqa: E402
from app.repositories import profile_repo, user_repo  # noqa: E402

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture(scope="session", autouse=True)
def _migrated_test_db():
    """Runs the real Alembic migrations against the test database once per
    test session - same schema-creation path as production, including the
    pgvector extension and the raw-SQL indexes plain metadata.create_all()
    would miss."""
    subprocess.run(["alembic", "upgrade", "head"], cwd=_BACKEND_DIR, env=os.environ, check=True)


@pytest.fixture()
def db() -> Session:
    """One test = one outer transaction, rolled back at the end. Repos call
    db.commit() internally, so a plain rollback wouldn't undo anything - the
    savepoint join mode intercepts those commits and releases/reopens a
    savepoint instead of ending the real transaction."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture()
def user(db: Session) -> User:
    return user_repo.create(db, username=f"testuser_{uuid.uuid4().hex[:8]}", password_hash=hash_password("x"))


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture()
def profile(db: Session, user: User) -> AssistantProfile:
    return profile_repo.upsert(
        db,
        user.id,
        assistant_name="Missy",
        persona_description="A helpful assistant.",
        user_about_me="A test user.",
        tone_preference=None,
        response_language="English",
    )
