"""Add first-class projects table

Revision ID: 9f3c2a1b7d44
Revises: 6b1f2c9e4a11
Create Date: 2026-05-21 14:20:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text


# revision identifiers, used by Alembic.
revision = '9f3c2a1b7d44'
down_revision = '6b1f2c9e4a11'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if 'project' not in tables:
        op.create_table(
            'project',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('description', sa.String(length=500), nullable=True),
            sa.Column('color', sa.String(length=7), nullable=True),
            sa.Column('archived', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('created_by_id', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['created_by_id'], ['user.id']),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('name'),
        )

    if 'task' not in set(inspect(bind).get_table_names()):
        return

    task_columns = {column['name'] for column in inspect(bind).get_columns('task')}
    if 'project_id' not in task_columns:
        with op.batch_alter_table('task', schema=None) as batch_op:
            batch_op.add_column(sa.Column('project_id', sa.Integer(), nullable=True))
            batch_op.create_foreign_key('fk_task_project_id_project', 'project', ['project_id'], ['id'])

    project_rows = bind.execute(text("SELECT DISTINCT COALESCE(NULLIF(TRIM(project), ''), 'Ogólny') FROM task")).fetchall()
    for row in project_rows:
        name = row[0]
        existing = bind.execute(text("SELECT id FROM project WHERE name = :name"), {"name": name}).first()
        if existing:
            continue
        bind.execute(
            text(
                "INSERT INTO project (name, description, color, archived, created_at) "
                "VALUES (:name, '', '#3b82f6', 0, CURRENT_TIMESTAMP)"
            ),
            {"name": name},
        )

    bind.execute(
        text(
            "UPDATE task SET project_id = ("
            "SELECT project.id FROM project "
            "WHERE project.name = COALESCE(NULLIF(TRIM(task.project), ''), 'Ogólny')"
            ") WHERE project_id IS NULL"
        )
    )


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if 'task' in tables:
        task_columns = {column['name'] for column in inspector.get_columns('task')}
        if 'project_id' in task_columns:
            with op.batch_alter_table('task', schema=None) as batch_op:
                batch_op.drop_constraint('fk_task_project_id_project', type_='foreignkey')
                batch_op.drop_column('project_id')

    if 'project' in set(inspect(bind).get_table_names()):
        op.drop_table('project')
