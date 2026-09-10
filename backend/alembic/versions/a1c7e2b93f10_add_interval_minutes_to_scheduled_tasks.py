"""add interval_minutes to scheduled_tasks

Intervals were whole hours only, so a job could not run more often than once
an hour. The scheduler loop already ticks every 60 seconds, so minute-level
intervals need nothing new at run time - only somewhere to store them.

interval_hours is kept as-is so existing rows keep working; a task carries
one or the other.

Revision ID: a1c7e2b93f10
Revises: 9d0abe53a312
Create Date: 2026-09-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a1c7e2b93f10"
down_revision: Union[str, Sequence[str], None] = "9d0abe53a312"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("scheduled_tasks", sa.Column("interval_minutes", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("scheduled_tasks", "interval_minutes")
