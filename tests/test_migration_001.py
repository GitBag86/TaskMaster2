"""Tests for the team_workspaces schema+backfill migration (Task 6).

The migration is already applied at conftest fixture time (db.create_all()
mirrors the migrated schema). What we test here is the IDEMPOTENT BEHAVIOR
of the data migration helpers themselves, plus invariants the backfill must
guarantee.

Note: index/column existence checks are NOT in these unit tests because
TestingConfig uses sqlite::memory: with db.create_all() (not Alembic upgrade).
create_all builds schema from the model metadata, which doesn't include
indexes that we add in migration files. The migration itself is verified
manually in dev (sqlite tasks.db) and will be verified on production
via the Task 6 deploy plan.
"""

from __future__ import annotations

from datetime import datetime, timezone

from models import (
    ProjectTemplate,
    Team,
    User,
    db,
)


def utcnow_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _make_user(username="legacy", role="user", team_id=None):
    u = User(username=username, email=f"{username}@example.com", role=role, team_id=team_id)
    u.set_password("p")
    db.session.add(u)
    db.session.flush()
    return u


def test_default_team_has_3_seed_project_templates(app):
    """Verifies the seeding logic from the migration."""
    from utils.template_service import seed_team_templates

    with app.app_context():
        team = Team(name="Default", slug="default")
        db.session.add(team)
        db.session.flush()

        seed_team_templates(team.id)
        db.session.commit()

        keys = {t.source_catalogue_key for t in ProjectTemplate.query.filter_by(team_id=team.id)}
        assert keys == {"client_onboarding", "release", "campaign"}


def test_seed_team_templates_idempotency(app):
    from utils.template_service import seed_team_templates

    with app.app_context():
        team = Team(name="Idem", slug="idem")
        db.session.add(team)
        db.session.flush()

        seed_team_templates(team.id)
        seed_team_templates(team.id)
        db.session.commit()

        assert ProjectTemplate.query.filter_by(team_id=team.id).count() == 3


def test_user_can_have_team_id_after_migration(app):
    """Schema invariant: User.team_id column exists and FK works."""
    with app.app_context():
        team = Team(name="Mig", slug="mig")
        db.session.add(team)
        db.session.flush()

        u = _make_user("u1", role="user", team_id=team.id)
        db.session.commit()

        assert u.team_id == team.id


def test_super_admin_can_have_null_team_id(app):
    """Schema invariant: User.team_id is NULLable for super_admin (R2.3)."""
    with app.app_context():
        u = _make_user("super", role="super_admin", team_id=None)
        db.session.commit()
        assert u.team_id is None


def test_session_version_starts_at_zero_for_new_users(app):
    """New users default session_version=0."""
    with app.app_context():
        u = _make_user("v0", role="user", team_id=None)
        db.session.commit()
        assert u.session_version == 0


def test_team_creation_independent_per_session(app):
    """Two teams can coexist; resources scope correctly via team_id."""
    with app.app_context():
        team_a = Team(name="A", slug="a")
        team_b = Team(name="B", slug="b")
        db.session.add_all([team_a, team_b])
        db.session.flush()

        ua = _make_user("a_user", role="user", team_id=team_a.id)
        ub = _make_user("b_user", role="user", team_id=team_b.id)
        db.session.commit()

        # Cross-validation
        assert ua.team_id != ub.team_id
        assert ua.team.name == "A"
        assert ub.team.name == "B"
