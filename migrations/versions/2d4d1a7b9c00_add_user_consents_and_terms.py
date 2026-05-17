"""Add user consent fields for terms/privacy/marketing

Revision ID: 2d4d1a7b9c00
Revises: f6a06dfeb020
Create Date: 2026-05-17 23:35:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = '2d4d1a7b9c00'
down_revision = 'f6a06dfeb020'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    if 'user' not in set(inspector.get_table_names()):
        return

    user_columns = {column['name'] for column in inspector.get_columns('user')}

    with op.batch_alter_table('user', schema=None) as batch_op:
        if 'terms_accepted' not in user_columns:
            batch_op.add_column(sa.Column('terms_accepted', sa.Boolean(), nullable=False, server_default=sa.false()))
        if 'privacy_accepted' not in user_columns:
            batch_op.add_column(sa.Column('privacy_accepted', sa.Boolean(), nullable=False, server_default=sa.false()))
        if 'marketing_consent' not in user_columns:
            batch_op.add_column(sa.Column('marketing_consent', sa.Boolean(), nullable=False, server_default=sa.false()))
        if 'consented_at' not in user_columns:
            batch_op.add_column(sa.Column('consented_at', sa.DateTime(), nullable=True))


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    if 'user' not in set(inspector.get_table_names()):
        return

    user_columns = {column['name'] for column in inspector.get_columns('user')}

    with op.batch_alter_table('user', schema=None) as batch_op:
        if 'consented_at' in user_columns:
            batch_op.drop_column('consented_at')
        if 'marketing_consent' in user_columns:
            batch_op.drop_column('marketing_consent')
        if 'privacy_accepted' in user_columns:
            batch_op.drop_column('privacy_accepted')
        if 'terms_accepted' in user_columns:
            batch_op.drop_column('terms_accepted')
