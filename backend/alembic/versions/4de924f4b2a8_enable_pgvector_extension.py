"""enable pgvector extension

Revision ID: 4de924f4b2a8
Revises: a6ee0d4e382a
Create Date: 2026-07-28 22:05:05.438911

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4de924f4b2a8'
down_revision: Union[str, Sequence[str], None] = 'a6ee0d4e382a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP EXTENSION IF EXISTS vector")
