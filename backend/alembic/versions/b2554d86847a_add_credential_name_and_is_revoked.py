"""add credential name and is_revoked

Revision ID: b2554d86847a
Revises: fdc5f6c736d7
Create Date: 2026-08-08 02:39:40.033889

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2554d86847a'
down_revision: Union[str, Sequence[str], None] = 'fdc5f6c736d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('llm_credentials', sa.Column('name', sa.String(length=128), nullable=True))
    # server_default backfills existing rows to False, matching the model's
    # Python-side default for anything created going forward.
    op.add_column(
        'llm_credentials', sa.Column('is_revoked', sa.Boolean(), server_default=sa.text('false'), nullable=False)
    )
    # NOTE: the "removed index" lines autogenerate detected for
    # knowledge_chunks/knowledge_sources/memory_entries are false positives -
    # those indexes were created via raw SQL in earlier migrations, so
    # alembic doesn't recognize them against model metadata. Not touched here.


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('llm_credentials', 'is_revoked')
    op.drop_column('llm_credentials', 'name')
