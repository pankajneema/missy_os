"""add groq provider

Revision ID: 79e72a899035
Revises: 0e65b017e58f
Create Date: 2026-07-28 02:34:02.902688

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '79e72a899035'
down_revision: Union[str, Sequence[str], None] = '0e65b017e58f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("ALTER TYPE llm_provider ADD VALUE IF NOT EXISTS 'groq'")


def downgrade() -> None:
    """Downgrade schema."""
    # Postgres has no DROP VALUE for enums - removing 'groq' would require
    # rebuilding the type (and any rows using it). Not supported here.
    raise NotImplementedError("Cannot drop an enum value in Postgres - downgrade manually if truly needed.")
