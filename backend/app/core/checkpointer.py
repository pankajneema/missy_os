from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool

from app.core.config import get_settings


def _psycopg3_conninfo() -> str:
    """LangGraph's Postgres checkpointer uses psycopg3, while the rest of
    the app talks to Postgres via SQLAlchemy's psycopg2 driver - same
    database, different driver, so the URL's driver suffix has to go."""
    return get_settings().database_url.replace("postgresql+psycopg2://", "postgresql://")


@asynccontextmanager
async def open_checkpointer() -> AsyncIterator[AsyncPostgresSaver]:
    # autocommit=True - checkpointer.setup() runs CREATE INDEX CONCURRENTLY,
    # which errors ("cannot run inside a transaction block") on a pooled
    # connection's default transactional mode.
    pool = AsyncConnectionPool(conninfo=_psycopg3_conninfo(), max_size=10, open=False, kwargs={"autocommit": True})
    await pool.open()
    try:
        checkpointer = AsyncPostgresSaver(pool)
        await checkpointer.setup()
        yield checkpointer
    finally:
        await pool.close()
