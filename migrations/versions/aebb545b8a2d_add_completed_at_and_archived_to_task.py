"""add completed_at and archived to task

Revision ID: aebb545b8a2d
Revises: db04425f80ae
Create Date: 2026-06-15 00:28:33.371990

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'aebb545b8a2d'
down_revision = 'db04425f80ae'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('task', schema=None) as batch_op:
        batch_op.add_column(sa.Column('archived', sa.Boolean(), nullable=True, server_default=sa.false()))
        batch_op.add_column(sa.Column('completed_at', sa.DateTime(), nullable=True))
    # Set default for existing rows
    op.execute("UPDATE task SET archived = FALSE WHERE archived IS NULL")


def downgrade():
    with op.batch_alter_table('task', schema=None) as batch_op:
        batch_op.drop_column('completed_at')
        batch_op.drop_column('archived')