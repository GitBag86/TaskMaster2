"""Add many-to-many task assignees and mandatory user email

Revision ID: f6a06dfeb020
Revises: 6982584511d3
Create Date: 2026-05-16 10:01:52.853632

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = 'f6a06dfeb020'
down_revision = '6982584511d3'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if 'task_assignees' not in tables:
        op.create_table(
            'task_assignees',
            sa.Column('task_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(['task_id'], ['task.id']),
            sa.ForeignKeyConstraint(['user_id'], ['user.id']),
            sa.PrimaryKeyConstraint('task_id', 'user_id')
        )

    task_columns = {c['name'] for c in inspect(bind).get_columns('task')}
    if 'assigned_to' in task_columns:
        with op.batch_alter_table('task', schema=None) as batch_op:
            batch_op.drop_column('assigned_to')

    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.alter_column('email',
               existing_type=sa.VARCHAR(length=100),
               nullable=False)

    # ### end Alembic commands ###


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.alter_column('email',
               existing_type=sa.VARCHAR(length=100),
               nullable=True)

    task_columns = {c['name'] for c in inspector.get_columns('task')}
    if 'assigned_to' not in task_columns:
        with op.batch_alter_table('task', schema=None) as batch_op:
            batch_op.add_column(sa.Column('assigned_to', sa.VARCHAR(length=100), nullable=True))

    if 'task_assignees' in set(inspector.get_table_names()):
        op.drop_table('task_assignees')
