"""Add task status

Revision ID: 6982584511d3
Revises: 
Create Date: 2026-05-15 22:54:43.463958

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = '6982584511d3'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    # Bootstrap legacy baseline schema for fresh databases.
    # This project's first migration was created against an already-existing DB.
    if 'user' not in tables:
        op.create_table(
            'user',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('username', sa.String(length=100), nullable=False),
            sa.Column('password', sa.String(length=255), nullable=False),
            sa.Column('email', sa.String(length=100), nullable=True),
            sa.Column('role', sa.String(length=20), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('email'),
            sa.UniqueConstraint('username'),
        )

    if 'task' not in tables:
        op.create_table(
            'task',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('assigned_to', sa.String(length=100), nullable=True),
            sa.Column('title', sa.String(length=200), nullable=False),
            sa.Column('priority', sa.String(length=20), nullable=True),
            sa.Column('project', sa.String(length=100), nullable=True),
            sa.Column('due_date', sa.Date(), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('completed', sa.Boolean(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['user.id']),
            sa.PrimaryKeyConstraint('id'),
        )

    if 'comment' not in tables:
        op.create_table(
            'comment',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('task_id', sa.Integer(), nullable=False),
            sa.Column('author', sa.String(length=100), nullable=True),
            sa.Column('text', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['task_id'], ['task.id']),
            sa.PrimaryKeyConstraint('id'),
        )

    if 'subtask' not in tables:
        op.create_table(
            'subtask',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('task_id', sa.Integer(), nullable=False),
            sa.Column('title', sa.String(length=200), nullable=False),
            sa.Column('completed', sa.Boolean(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['task_id'], ['task.id']),
            sa.PrimaryKeyConstraint('id'),
        )

    # Add status only if it's still missing.
    columns = {c['name'] for c in inspect(bind).get_columns('task')}
    if 'status' not in columns:
        with op.batch_alter_table('task', schema=None) as batch_op:
            batch_op.add_column(sa.Column('status', sa.String(length=20), nullable=True))


def downgrade():
    bind = op.get_bind()
    columns = {c['name'] for c in inspect(bind).get_columns('task')}
    if 'status' in columns:
        with op.batch_alter_table('task', schema=None) as batch_op:
            batch_op.drop_column('status')
