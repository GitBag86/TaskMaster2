"""Tests for Team, TeamInvite, TeamAuditLog models (Task 2 of team-workspaces).

Covers:
- Construction with required + optional fields.
- Serialization (`to_dict`).
- TeamInvite.is_active() lifecycle (active, expired, consumed).
- TeamAuditLog `to_dict` includes actor username when actor relationship loaded.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from models import Team, TeamAuditLog, TeamInvite, User, db


def utcnow():
    return datetime.now(timezone.utc)


def _make_user(username: str = "tester", email: str | None = None, role: str = "user") -> User:
    user = User(username=username, email=email or f"{username}@example.com", role=role)
    user.set_password("password")
    db.session.add(user)
    db.session.flush()
    return user


def test_team_create_and_to_dict(app):
    with app.app_context():
        team = Team(name="Marketing", slug="marketing", description="The marketing crew")
        db.session.add(team)
        db.session.commit()

        data = team.to_dict()
        assert data["name"] == "Marketing"
        assert data["slug"] == "marketing"
        assert data["description"] == "The marketing crew"
        assert data["archived"] is False
        assert data["created_at"] is not None


def test_team_to_dict_with_stats_includes_member_count(app):
    with app.app_context():
        team = Team(name="Ops", slug="ops")
        db.session.add(team)
        db.session.commit()

        data = team.to_dict(include_stats=True)
        assert "stats" in data
        assert data["stats"]["members"] == 0


def test_team_archived_default_false(app):
    with app.app_context():
        team = Team(name="Default", slug="default")
        db.session.add(team)
        db.session.commit()
        assert team.archived is False


def test_team_invite_active_when_not_consumed_and_not_expired(app):
    with app.app_context():
        team = Team(name="A", slug="a")
        db.session.add(team)
        db.session.commit()

        invite = TeamInvite(
            team_id=team.id,
            token_hash="a" * 64,
            expires_at=utcnow() + timedelta(days=7),
        )
        db.session.add(invite)
        db.session.commit()

        assert invite.is_active() is True


def test_team_invite_inactive_when_expired(app):
    with app.app_context():
        team = Team(name="B", slug="b")
        db.session.add(team)
        db.session.commit()

        invite = TeamInvite(
            team_id=team.id,
            token_hash="b" * 64,
            expires_at=utcnow() - timedelta(seconds=1),
        )
        db.session.add(invite)
        db.session.commit()

        assert invite.is_active() is False


def test_team_invite_inactive_when_consumed(app):
    with app.app_context():
        team = Team(name="C", slug="c")
        db.session.add(team)
        db.session.commit()

        invite = TeamInvite(
            team_id=team.id,
            token_hash="c" * 64,
            expires_at=utcnow() + timedelta(days=7),
            consumed_at=utcnow(),
        )
        db.session.add(invite)
        db.session.commit()

        assert invite.is_active() is False


def test_team_invite_to_dict_omits_token_by_default(app):
    with app.app_context():
        team = Team(name="D", slug="d")
        db.session.add(team)
        db.session.commit()

        invite = TeamInvite(
            team_id=team.id,
            token_hash="d" * 64,
            expires_at=utcnow() + timedelta(days=7),
            default_role="user",
        )
        db.session.add(invite)
        db.session.commit()

        data = invite.to_dict()
        assert "token" not in data
        assert data["default_role"] == "user"
        assert data["active"] is True


def test_team_invite_to_dict_includes_token_when_passed(app):
    with app.app_context():
        team = Team(name="E", slug="e")
        db.session.add(team)
        db.session.commit()

        invite = TeamInvite(
            team_id=team.id,
            token_hash="e" * 64,
            expires_at=utcnow() + timedelta(days=7),
        )
        db.session.add(invite)
        db.session.commit()

        data = invite.to_dict(include_token="raw-secret-token")
        assert data["token"] == "raw-secret-token"


def test_team_audit_log_to_dict_resolves_actor_username(app):
    with app.app_context():
        actor = _make_user("super", role="super_admin")
        team = Team(name="F", slug="f", created_by_id=actor.id)
        db.session.add(team)
        db.session.commit()

        entry = TeamAuditLog(
            actor_id=actor.id,
            action="team.create",
            target_team_id=team.id,
            details={"name": "F"},
        )
        db.session.add(entry)
        db.session.commit()

        data = entry.to_dict()
        assert data["action"] == "team.create"
        assert data["target_team_id"] == team.id
        assert data["actor"] == "super"
        assert data["details"] == {"name": "F"}


def test_team_audit_log_supports_user_move_with_source_and_target_team(app):
    with app.app_context():
        actor = _make_user("super", role="super_admin")
        team_a = Team(name="A1", slug="a1")
        team_b = Team(name="B1", slug="b1")
        moved_user = _make_user("moved", role="user")
        db.session.add_all([team_a, team_b])
        db.session.commit()

        entry = TeamAuditLog(
            actor_id=actor.id,
            action="user.move",
            target_user_id=moved_user.id,
            source_team_id=team_a.id,
            target_team_id=team_b.id,
        )
        db.session.add(entry)
        db.session.commit()

        data = entry.to_dict()
        assert data["target_user_id"] == moved_user.id
        assert data["source_team_id"] == team_a.id
        assert data["target_team_id"] == team_b.id


def test_team_invite_cascade_delete_on_team_delete(app):
    """Deleting a team cascades to its invites (FK ondelete='CASCADE')."""
    with app.app_context():
        team = Team(name="Doomed", slug="doomed")
        db.session.add(team)
        db.session.commit()

        invite = TeamInvite(
            team_id=team.id,
            token_hash="x" * 64,
            expires_at=utcnow() + timedelta(days=1),
        )
        db.session.add(invite)
        db.session.commit()
        invite_id = invite.id

        db.session.delete(team)
        db.session.commit()

        assert db.session.get(TeamInvite, invite_id) is None
