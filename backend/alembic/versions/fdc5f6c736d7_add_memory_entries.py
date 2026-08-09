"""add memory entries

Revision ID: fdc5f6c736d7
Revises: bb16561a0ba9
Create Date: 2026-08-08 00:41:24.279087

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import pgvector.sqlalchemy


# revision identifiers, used by Alembic.
revision: str = 'fdc5f6c736d7'
down_revision: Union[str, Sequence[str], None] = 'bb16561a0ba9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('memory_entries',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('category', sa.Enum('fact', 'preference', 'episodic', name='memory_category'), nullable=False),
    sa.Column('source', sa.Enum('auto', 'manual', name='memory_source'), nullable=False),
    sa.Column('embedding', pgvector.sqlalchemy.vector.VECTOR(dim=384), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_memory_entries_user_id', 'memory_entries', ['user_id'])
    # HNSW index for fast nearest-neighbor lookup on memory retrieval, same
    # pattern as knowledge_chunks.
    op.execute(
        "CREATE INDEX ix_memory_entries_embedding_hnsw ON memory_entries "
        "USING hnsw (embedding vector_cosine_ops)"
    )
    # NOTE: knowledge_chunks' content_tsv/embedding/source_id indexes and
    # knowledge_sources' user_id index were originally created via raw SQL
    # (op.execute), so alembic's autogenerate doesn't recognize them and
    # flags them as "removed" - they're not touched by this migration.


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('memory_entries')
