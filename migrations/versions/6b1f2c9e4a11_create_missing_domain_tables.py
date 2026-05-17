"""Create missing domain tables on existing databases

Revision ID: 6b1f2c9e4a11
Revises: 2d4d1a7b9c00
Create Date: 2026-05-17 23:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = '6b1f2c9e4a11'
down_revision = '2d4d1a7b9c00'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if 'tag' not in tables:
        op.create_table(
            'tag',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=50), nullable=False),
            sa.Column('color', sa.String(length=7), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['user.id']),
            sa.PrimaryKeyConstraint('id'),
        )

    tables = set(inspect(bind).get_table_names())
    if 'task_tags' not in tables:
        op.create_table(
            'task_tags',
            sa.Column('task_id', sa.Integer(), nullable=False),
            sa.Column('tag_id', sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(['task_id'], ['task.id']),
            sa.ForeignKeyConstraint(['tag_id'], ['tag.id']),
            sa.PrimaryKeyConstraint('task_id', 'tag_id'),
        )

    tables = set(inspect(bind).get_table_names())
    if 'saved_filter' not in tables:
        op.create_table(
            'saved_filter',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('filters', sa.JSON(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['user.id']),
            sa.PrimaryKeyConstraint('id'),
        )

    tables = set(inspect(bind).get_table_names())
    if 'activity_log' not in tables:
        op.create_table(
            'activity_log',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=True),
            sa.Column('task_id', sa.Integer(), nullable=True),
            sa.Column('action', sa.String(length=50), nullable=False),
            sa.Column('details', sa.JSON(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['task_id'], ['task.id']),
            sa.ForeignKeyConstraint(['user_id'], ['user.id']),
            sa.PrimaryKeyConstraint('id'),
        )

    tables = set(inspect(bind).get_table_names())
    if 'recurring_task' not in tables:
        op.create_table(
            'recurring_task',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('task_id', sa.Integer(), nullable=False),
            sa.Column('frequency', sa.String(length=20), nullable=False),
            sa.Column('interval', sa.Integer(), nullable=True),
            sa.Column('end_date', sa.Date(), nullable=True),
            sa.Column('last_generated', sa.DateTime(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['task_id'], ['task.id']),
            sa.PrimaryKeyConstraint('id'),
        )

    tables = set(inspect(bind).get_table_names())
    if 'task_template' not in tables:
        op.create_table(
            'task_template',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=200), nullable=False),
            sa.Column('description', sa.String(length=500), nullable=True),
            sa.Column('template_data', sa.JSON(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['user.id']),
            sa.PrimaryKeyConstraint('id'),
        )

    tables = set(inspect(bind).get_table_names())
    if 'task_dependency' not in tables:
        op.create_table(
            'task_dependency',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('task_id', sa.Integer(), nullable=False),
            sa.Column('depends_on_task_id', sa.Integer(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['depends_on_task_id'], ['task.id']),
            sa.ForeignKeyConstraint(['task_id'], ['task.id']),
            sa.PrimaryKeyConstraint('id'),
        )

    tables = set(inspect(bind).get_table_names())
    if 'custom_field' not in tables:
        op.create_table(
            'custom_field',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('task_id', sa.Integer(), nullable=False),
            sa.Column('field_name', sa.String(length=100), nullable=False),
            sa.Column('field_value', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['task_id'], ['task.id']),
            sa.ForeignKeyConstraint(['user_id'], ['user.id']),
            sa.PrimaryKeyConstraint('id'),
        )


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if 'custom_field' in tables:
        op.drop_table('custom_field')
    if 'task_dependency' in tables:
        op.drop_table('task_dependency')
    if 'task_template' in tables:
        op.drop_table('task_template')
    if 'recurring_task' in tables:
        op.drop_table('recurring_task')
    if 'activity_log' in tables:
        op.drop_table('activity_log')
    if 'saved_filter' in tables:
        op.drop_table('saved_filter')
    if 'task_tags' in tables:
        op.drop_table('task_tags')
    if 'tag' in tables:
        op.drop_table('tag')
