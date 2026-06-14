"""add completed_at to task

Revision ID: add_completed_at_to_task
Revises: 2c8e44f754b0
Create Date: 2026-06-14

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_completed_at_to_task'
down_revision = '2c8e44f754b0'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('task', sa.Column('completed_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('task', 'completed_at')