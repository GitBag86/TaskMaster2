"""add password_reset_token table

Revision ID: db04425f80ae
Revises: 2c8e44f754b0
Create Date: 2026-06-08 02:02:11.239560

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'db04425f80ae'
down_revision = '2c8e44f754b0'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('password_reset_token',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.Column('consumed_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash')
    )


def downgrade():
    op.drop_table('password_reset_token')