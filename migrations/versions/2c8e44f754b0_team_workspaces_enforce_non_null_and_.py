"""team_workspaces enforce non-null and constraints

Revision ID: 2c8e44f754b0
Revises: 81d661ec5395
Create Date: 2026-05-24 14:45:47

This is the second half of the team_workspaces schema change. It tightens
the schema after revision 81d661ec5395 has populated all team_id values:

- Pre-check: every team-scoped table must have zero rows with team_id IS NULL.
  If any are found we abort the upgrade with a clear error pointing at the
  offending table (R4.8).
- ALTER COLUMN team_id SET NOT NULL on every team-scoped table.
- Drop globally-unique indexes on project.name and tag.name (legacy).
  We leave per-team uniqueness on Postgres only (functional partial indexes
  with LOWER(name)). On SQLite the lack of a unique constraint here is OK
  because dev/test traffic is tiny and the application layer enforces it.
- Add CHECK constraint on user: super_admin has NULL team_id; manager/user
  must have non-NULL team_id (R2.3-R2.5).
- Composite indexes for the hottest read paths (dashboard, today view,
  notifications), see design 15.1.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2c8e44f754b0'
down_revision = '81d661ec5395'
branch_labels = None
depends_on = None


TEAM_SCOPED_TABLES = (
    'task',
    'project',
    'tag',
    'saved_filter',
    'task_template',
    'recurring_task',
    'notification',
    'activity_log',
    'custom_field',
    'comment',
    'subtask',
    'task_dependency',
)


def _assert_no_orphans(connection):
    """R4.8 / R29.1: refuse to enforce NOT NULL while any row still has team_id IS NULL."""
    failures = []
    for tname in TEAM_SCOPED_TABLES:
        count = connection.execute(
            sa.text(f"SELECT COUNT(*) FROM {tname} WHERE team_id IS NULL")
        ).scalar()
        if count and count > 0:
            failures.append((tname, count))
    if failures:
        msg_lines = [f"  - {tname}: {count} rows" for tname, count in failures]
        raise RuntimeError(
            "Migration 002 aborted: some team-scoped tables still have NULL team_id. "
            "Run revision 81d661ec5395 first or manually backfill these rows:\n"
            + "\n".join(msg_lines)
        )


def _alter_columns_set_not_null():
    """Set team_id NOT NULL on every team-scoped table.

    On SQLite this requires batch_alter_table (which copy-and-moves the table).
    """
    for tname in TEAM_SCOPED_TABLES:
        with op.batch_alter_table(tname, schema=None) as batch_op:
            batch_op.alter_column(
                'team_id',
                existing_type=sa.Integer(),
                nullable=False,
            )


def _alter_columns_set_nullable():
    """Reverse: allow NULL again (used by downgrade)."""
    for tname in TEAM_SCOPED_TABLES:
        with op.batch_alter_table(tname, schema=None) as batch_op:
            batch_op.alter_column(
                'team_id',
                existing_type=sa.Integer(),
                nullable=True,
            )


def _drop_legacy_global_unique_constraints():
    """Drop the OLD globally-unique constraints on project.name and tag.name.

    Per-team uniqueness will be enforced by the new partial functional indexes
    below (Postgres only) plus application-layer checks on SQLite.

    We probe the live schema first because the constraint/index names vary
    by dialect: SQLite generated `sqlite_autoindex_project_X` for the
    legacy `unique=True` column declaration, while Postgres typically uses
    `project_name_key`.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # Project: any unique constraint or unique index on the `name` column needs to go.
    for tname in ('project', 'tag'):
        # 1. Named unique constraints (Postgres path).
        for uc in inspector.get_unique_constraints(tname):
            cols = uc.get('column_names') or []
            if cols == ['name'] and uc.get('name'):
                with op.batch_alter_table(tname, schema=None) as batch_op:
                    batch_op.drop_constraint(uc['name'], type_='unique')

        # 2. Unique indexes named explicitly (some Postgres setups).
        for idx in inspector.get_indexes(tname):
            cols = idx.get('column_names') or []
            if idx.get('unique') and cols == ['name'] and idx.get('name'):
                with op.batch_alter_table(tname, schema=None) as batch_op:
                    batch_op.drop_index(idx['name'])

        # 3. SQLite auto-generated unique indexes (`sqlite_autoindex_<table>_<n>`)
        #    for `unique=True` columns: best handled implicitly when batch_alter_table
        #    rebuilds the table during `_alter_columns_set_not_null`. The new model
        #    metadata no longer marks `name` as unique=True.


def _create_per_team_unique_indexes():
    """Postgres: functional partial unique on LOWER(name) for project and tag.

    On SQLite we install a non-unique functional index — the application
    layer enforces uniqueness; tiny dev datasets won't notice.
    """
    op.create_index(
        'uq_project_team_name_lower',
        'project',
        [sa.text('team_id'), sa.text('LOWER(name)')],
        unique=True,
        postgresql_where=sa.text('archived = false'),
        sqlite_where=sa.text('archived = 0'),
    )
    op.create_index(
        'uq_tag_team_name_lower',
        'tag',
        [sa.text('team_id'), sa.text('LOWER(name)')],
        unique=True,
    )


def _drop_per_team_unique_indexes():
    op.drop_index('uq_tag_team_name_lower', table_name='tag')
    op.drop_index('uq_project_team_name_lower', table_name='project')


def _add_check_constraint_user_team_role():
    """R2.3-R2.5: super_admin <=> team_id IS NULL; manager/user <=> team_id NOT NULL."""
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.create_check_constraint(
            'ck_user_team_role_consistency',
            "(role = 'super_admin' AND team_id IS NULL) OR "
            "(role IN ('manager', 'user') AND team_id IS NOT NULL)",
        )


def _drop_check_constraint_user_team_role():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_constraint('ck_user_team_role_consistency', type_='check')


def _create_composite_indexes():
    """Hot-path composite indexes for dashboard/today/notifications (design 15.1)."""
    # Open tasks per team ordered by due_date — used by /tasks/today, /tasks/blocked.
    op.create_index(
        'ix_task_team_due',
        'task',
        ['team_id', 'due_date'],
        postgresql_where=sa.text('completed = false'),
        sqlite_where=sa.text('completed = 0'),
    )
    # Status filters per team.
    op.create_index(
        'ix_task_team_status',
        'task',
        ['team_id', 'status'],
    )
    # Notification widget — unread per user/team.
    op.create_index(
        'ix_notification_team_user_unread',
        'notification',
        ['team_id', 'user_id'],
        postgresql_where=sa.text('read = false'),
        sqlite_where=sa.text('read = 0'),
    )
    # Activity log feed — recent events per team.
    op.create_index(
        'ix_activity_team_created',
        'activity_log',
        ['team_id', sa.text('created_at DESC')],
    )


def _drop_composite_indexes():
    op.drop_index('ix_activity_team_created', table_name='activity_log')
    op.drop_index('ix_notification_team_user_unread', table_name='notification')
    op.drop_index('ix_task_team_status', table_name='task')
    op.drop_index('ix_task_team_due', table_name='task')


def upgrade():
    connection = op.get_bind()

    _assert_no_orphans(connection)
    _alter_columns_set_not_null()
    _drop_legacy_global_unique_constraints()
    _create_per_team_unique_indexes()
    _add_check_constraint_user_team_role()
    _create_composite_indexes()


def downgrade():
    _drop_composite_indexes()
    _drop_check_constraint_user_team_role()
    _drop_per_team_unique_indexes()
    _alter_columns_set_nullable()
    # We don't restore the legacy global UNIQUE on project.name / tag.name —
    # the data may now contain duplicates across teams that would violate it.
