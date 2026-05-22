"""add project members

Revision ID: b8e4c6f2a901
Revises: a4c7d9e2b531
Create Date: 2026-05-22 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b8e4c6f2a901'
down_revision = 'a4c7d9e2b531'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'project_members',
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['project.id']),
        sa.ForeignKeyConstraint(['user_id'], ['user.id']),
        sa.PrimaryKeyConstraint('project_id', 'user_id'),
    )


def downgrade():
    op.drop_table('project_members')
