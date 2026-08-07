"""Store the recipient email on team invitations.

Revision ID: c1d2e3f4a5b6
Revises: aebb545b8a2d
Create Date: 2026-08-07 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "c1d2e3f4a5b6"
down_revision = "aebb545b8a2d"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "team_invite",
        sa.Column("email", sa.String(length=320), nullable=True),
    )


def downgrade():
    op.drop_column("team_invite", "email")
