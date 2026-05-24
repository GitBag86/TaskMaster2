"""add project_template per-team table

Revision ID: ccbe104854e4
Revises: 5700fc57959b
Create Date: 2026-05-24 13:06:18.665399

Creates the per-team project_template table. Each team owns its own copies
of the catalogue templates (Wdrożenie klienta, Release, Kampania) plus any
custom templates the manager creates. See R17 / design 7.

The Default team gets seeded by Task 6's data backfill via
utils/template_service.seed_team_templates(). Newly created teams will get
seeded by routes/admin.py::create_team() in Task 20.

The autogen also flagged index drops on team/team_invite/team_audit_log —
those are false positives from SQLite's incomplete index reflection
(partial/expression indexes); they have been removed by hand. The original
indexes from a0a6a0fd5858 are still in place.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ccbe104854e4'
down_revision = '5700fc57959b'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'project_template',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('team_id', sa.Integer(), nullable=False),
        sa.Column('source_catalogue_key', sa.String(length=50), nullable=True),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.String(length=500), server_default='', nullable=False),
        sa.Column('color', sa.String(length=7), server_default='#3b82f6', nullable=False),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['user.id']),
        sa.ForeignKeyConstraint(['team_id'], ['team.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_project_template_team', 'project_template', ['team_id'])
    op.create_index(
        'ix_project_template_team_key',
        'project_template',
        ['team_id', 'source_catalogue_key'],
    )


def downgrade():
    op.drop_index('ix_project_template_team_key', table_name='project_template')
    op.drop_index('ix_project_template_team', table_name='project_template')
    op.drop_table('project_template')
