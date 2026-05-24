"""team_workspaces schema and backfill

Revision ID: 81d661ec5395
Revises: ccbe104854e4
Create Date: 2026-05-24 14:15:20

This is the big one. After this revision:
- Every team-scoped resource (task, project, tag, saved_filter, task_template,
  recurring_task, notification, activity_log, comment, subtask, task_dependency,
  custom_field) gets a NULLable team_id column with FK to team(id).
- The Default team is created (or reused if already present, idempotent).
- Bootstrap admin account is promoted to role='super_admin', team_id=NULL.
- All other existing users (legacy 'admin' or 'user') are migrated:
    * legacy 'admin' (other than bootstrap) -> 'manager' in Default team.
    * legacy 'user' -> 'user' in Default team.
- All pre-existing rows in team-scoped tables get team_id = Default.id.
  Comment/Subtask/TaskDependency derive team_id from their parent task.
- session_version is bumped on every user so all active sessions invalidate.
- Default team gets seeded with the 3 catalogue project templates.

NOT NULL + CHECK constraints + composite indexes come in the FOLLOWING revision
(Task 7) so we can stop here in case backfill needs manual fixup.

Idempotent: running on a database that already had this revision applied is a
no-op (each UPDATE is gated by `WHERE team_id IS NULL`; INSERTs check for
existing rows first).
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import column, table


# revision identifiers, used by Alembic.
revision = '81d661ec5395'
down_revision = 'ccbe104854e4'
branch_labels = None
depends_on = None


# Tables that get team_id directly (one of: project_id, owns its own data, or
# carries team_id denormalized for query simplicity per design 3.2).
TEAM_SCOPED_TABLES_DIRECT = (
    'task',
    'project',
    'tag',
    'saved_filter',
    'task_template',
    'recurring_task',
    'notification',
    'activity_log',
    'custom_field',
)

# Tables that derive team_id from a parent task. The column is added the same
# way; the value is backfilled via a join.
TEAM_SCOPED_TABLES_FROM_TASK = (
    'comment',
    'subtask',
    'task_dependency',
)

ALL_TEAM_SCOPED_TABLES = TEAM_SCOPED_TABLES_DIRECT + TEAM_SCOPED_TABLES_FROM_TASK


# Reflective table objects used for data migration. Defined here (rather than
# imported from models.py) so the migration is independent of any future model
# refactor — Alembic best practice for data migrations.
def _team_table():
    return table(
        'team',
        column('id', sa.Integer),
        column('name', sa.String),
        column('slug', sa.String),
        column('description', sa.String),
        column('archived', sa.Boolean),
        column('created_at', sa.DateTime),
    )


def _user_table():
    return table(
        'user',
        column('id', sa.Integer),
        column('username', sa.String),
        column('role', sa.String),
        column('team_id', sa.Integer),
        column('session_version', sa.Integer),
    )


def _project_template_table():
    return table(
        'project_template',
        column('id', sa.Integer),
        column('team_id', sa.Integer),
        column('source_catalogue_key', sa.String),
        column('name', sa.String),
        column('description', sa.String),
        column('color', sa.String),
        column('payload', sa.JSON),
        column('created_at', sa.DateTime),
        column('updated_at', sa.DateTime),
    )


# Catalogue snapshot duplicated here so the migration is self-contained.
# The live catalogue lives in utils/project_template_catalogue.py — keep them
# in sync if you ever change the seed.
PROJECT_TEMPLATE_CATALOGUE_SNAPSHOT = {
    "client_onboarding": {
        "name": "Wdrożenie klienta",
        "description": "Standardowy proces startu współpracy z klientem.",
        "color": "#14b8a6",
        "tasks": [
            {"title": "Zebrać wymagania", "priority": "high", "due_offset": 1},
            {"title": "Przygotować plan wdrożenia", "priority": "high", "due_offset": 3, "depends_on": [0]},
            {"title": "Skonfigurować środowisko", "priority": "medium", "due_offset": 5, "depends_on": [1]},
            {"title": "Przeprowadzić szkolenie", "priority": "medium", "due_offset": 7, "depends_on": [2]},
            {"title": "Zamknąć odbiór", "priority": "high", "due_offset": 10, "depends_on": [3]},
        ],
    },
    "release": {
        "name": "Release",
        "description": "Kontrolna lista wydania wersji produkcyjnej.",
        "color": "#6366f1",
        "tasks": [
            {"title": "Zamrozić zakres release'u", "priority": "high", "due_offset": 1},
            {"title": "Przejść testy regresji", "priority": "high", "due_offset": 2, "depends_on": [0]},
            {"title": "Przygotować notatki wydania", "priority": "medium", "due_offset": 2, "depends_on": [0]},
            {"title": "Wdrożyć na produkcję", "priority": "high", "due_offset": 3, "depends_on": [1, 2]},
            {"title": "Monitorować po wdrożeniu", "priority": "medium", "due_offset": 4, "depends_on": [3]},
        ],
    },
    "campaign": {
        "name": "Kampania",
        "description": "Plan przygotowania i uruchomienia kampanii.",
        "color": "#f59e0b",
        "tasks": [
            {"title": "Ustalić cel kampanii", "priority": "high", "due_offset": 1},
            {"title": "Przygotować treści", "priority": "medium", "due_offset": 3, "depends_on": [0]},
            {"title": "Skonfigurować kanały", "priority": "medium", "due_offset": 4, "depends_on": [0]},
            {"title": "Uruchomić kampanię", "priority": "high", "due_offset": 5, "depends_on": [1, 2]},
            {"title": "Podsumować wyniki", "priority": "medium", "due_offset": 12, "depends_on": [3]},
        ],
    },
}


def _add_team_id_columns():
    """Add team_id column with FK on every team-scoped table.

    Uses batch_alter_table to support SQLite. Each batch contains exactly one
    column + FK to avoid the SQLAlchemy circular-dependency we hit in Task 3
    (every constraint added in the same batch as the column it references).
    """
    for tname in ALL_TEAM_SCOPED_TABLES:
        with op.batch_alter_table(tname, schema=None) as batch_op:
            batch_op.add_column(sa.Column('team_id', sa.Integer(), nullable=True))
        with op.batch_alter_table(tname, schema=None) as batch_op:
            batch_op.create_foreign_key(
                f'fk_{tname}_team_id', 'team', ['team_id'], ['id']
            )
        op.create_index(f'ix_{tname}_team', tname, ['team_id'])


def _drop_team_id_columns():
    """Reverse of _add_team_id_columns."""
    for tname in ALL_TEAM_SCOPED_TABLES:
        op.drop_index(f'ix_{tname}_team', table_name=tname)
        with op.batch_alter_table(tname, schema=None) as batch_op:
            batch_op.drop_constraint(f'fk_{tname}_team_id', type_='foreignkey')
            batch_op.drop_column('team_id')


def _ensure_default_team(connection) -> int:
    """Get-or-create the Default team. Returns its id."""
    teams = _team_table()
    existing = connection.execute(
        sa.select(teams.c.id).where(teams.c.name == 'Default')
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    connection.execute(
        teams.insert().values(
            name='Default',
            slug='default',
            description='Domyślny zespół utworzony przy migracji team-workspaces.',
            archived=False,
            created_at=now,
        )
    )
    # SELECT after INSERT — `inserted_primary_key` is unreliable in SQLite when
    # using core Connection.execute() inside Alembic op.get_bind().
    return connection.execute(
        sa.select(teams.c.id).where(teams.c.name == 'Default')
    ).scalar_one()


def _promote_bootstrap_admin(connection) -> int | None:
    """Promote the bootstrap admin (DEFAULT_ADMIN_USERNAME) to super_admin.

    Returns the bootstrap user id (or None if the account doesn't exist yet —
    e.g. a brand-new database with no users).
    """
    bootstrap_username = os.environ.get('DEFAULT_ADMIN_USERNAME', 'admin')
    users = _user_table()

    bootstrap_id = connection.execute(
        sa.select(users.c.id).where(users.c.username == bootstrap_username)
    ).scalar_one_or_none()
    if bootstrap_id is None:
        return None

    connection.execute(
        users.update()
        .where(users.c.id == bootstrap_id)
        .values(role='super_admin', team_id=None)
    )
    return bootstrap_id


def _migrate_existing_users(connection, default_team_id: int, bootstrap_id: int | None):
    """Move every non-bootstrap user into the Default team and remap roles.

    legacy 'admin' -> 'manager'
    legacy 'user'  -> 'user' (just sets team_id)
    """
    users = _user_table()

    # legacy admins (other than bootstrap) -> manager
    where_admin = users.c.role == 'admin'
    if bootstrap_id is not None:
        where_admin = sa.and_(where_admin, users.c.id != bootstrap_id)
    connection.execute(
        users.update()
        .where(where_admin)
        .values(role='manager', team_id=default_team_id)
    )

    # everyone else without team_id (idempotency: skip super_admin and already-migrated)
    connection.execute(
        users.update()
        .where(sa.and_(users.c.team_id.is_(None), users.c.role != 'super_admin'))
        .values(team_id=default_team_id)
    )

    # bump session_version on EVERY user so cookies issued before the migration
    # become stale (R7.7) — forces re-login under the new team scope.
    connection.execute(
        users.update().values(session_version=users.c.session_version + 1)
    )


def _backfill_direct_tables(connection, default_team_id: int):
    """Set team_id = default for every row in 9 root-team-scoped tables."""
    for tname in TEAM_SCOPED_TABLES_DIRECT:
        connection.execute(
            sa.text(f"UPDATE {tname} SET team_id = :tid WHERE team_id IS NULL"),
            {'tid': default_team_id},
        )


def _backfill_tables_from_task(connection):
    """Comment/Subtask/TaskDependency derive team_id from parent task."""
    # Comment
    connection.execute(sa.text(
        "UPDATE comment SET team_id = ("
        "    SELECT task.team_id FROM task WHERE task.id = comment.task_id"
        ") WHERE team_id IS NULL"
    ))
    # Subtask
    connection.execute(sa.text(
        "UPDATE subtask SET team_id = ("
        "    SELECT task.team_id FROM task WHERE task.id = subtask.task_id"
        ") WHERE team_id IS NULL"
    ))
    # TaskDependency — both task_id and depends_on_task_id should be in the same
    # team after backfill (validated by Task 8 going forward). Pick from task_id.
    connection.execute(sa.text(
        "UPDATE task_dependency SET team_id = ("
        "    SELECT task.team_id FROM task WHERE task.id = task_dependency.task_id"
        ") WHERE team_id IS NULL"
    ))


def _seed_default_team_templates(connection, default_team_id: int):
    """Insert the 3 catalogue templates as Default team's per-team copies.

    Idempotent: skips entries whose `(team_id, source_catalogue_key)` already
    exists.
    """
    templates = _project_template_table()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    for key, payload in PROJECT_TEMPLATE_CATALOGUE_SNAPSHOT.items():
        existing = connection.execute(
            sa.select(templates.c.id).where(
                sa.and_(
                    templates.c.team_id == default_team_id,
                    templates.c.source_catalogue_key == key,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            continue

        connection.execute(
            templates.insert().values(
                team_id=default_team_id,
                source_catalogue_key=key,
                name=payload['name'],
                description=payload.get('description', ''),
                color=payload.get('color', '#3b82f6'),
                payload={'tasks': payload['tasks']},
                created_at=now,
                updated_at=now,
            )
        )


def upgrade():
    # 1. Schema: add NULLable team_id + FK + plain index on every team-scoped table.
    _add_team_id_columns()

    # 2. Data backfill (skipped on empty database — no rows to migrate but the
    #    Default team is still useful, so we always create it).
    connection = op.get_bind()

    default_team_id = _ensure_default_team(connection)
    bootstrap_id = _promote_bootstrap_admin(connection)
    _migrate_existing_users(connection, default_team_id, bootstrap_id)
    _backfill_direct_tables(connection, default_team_id)
    _backfill_tables_from_task(connection)
    _seed_default_team_templates(connection, default_team_id)


def downgrade():
    # We don't reverse the data backfill — Default team rows can stay; they
    # become orphan team_ids after the schema is reverted, which is fine since
    # the column will be dropped with _drop_team_id_columns(). The Default team
    # row itself is left in place to make re-upgrade easy.
    _drop_team_id_columns()
