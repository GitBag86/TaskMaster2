"""Tests for the User model extensions added by Task 3 of team-workspaces.

Covers:
- New columns: team_id (nullable for now), session_version (default 0)
- Role helpers: is_super_admin, is_manager, is_team_member
- to_dict serialization with optional team expansion
- Three role variants: super_admin (no team), manager (with team), user (with team)
"""

from __future__ import annotations

from models import Team, User, db


def _make_team(name: str = "T") -> Team:
    team = Team(name=name, slug=name.lower())
    db.session.add(team)
    db.session.flush()
    return team


def test_user_can_be_created_without_team_for_super_admin(app):
    with app.app_context():
        admin = User(username="root", email="root@example.com", role="super_admin")
        admin.set_password("p")
        db.session.add(admin)
        db.session.commit()

        assert admin.team_id is None
        assert admin.session_version == 0
        assert admin.is_super_admin() is True
        assert admin.is_manager() is False
        assert admin.is_team_member() is False


def test_user_can_be_created_with_team_for_manager(app):
    with app.app_context():
        team = _make_team("Marketing")
        manager = User(
            username="lucyna", email="lucyna@example.com", role="manager", team_id=team.id
        )
        manager.set_password("p")
        db.session.add(manager)
        db.session.commit()

        assert manager.team_id == team.id
        assert manager.is_manager() is True
        assert manager.is_super_admin() is False
        assert manager.is_team_member() is True
        assert manager.team.name == "Marketing"


def test_user_can_be_created_with_team_for_regular_user(app):
    with app.app_context():
        team = _make_team("Ops")
        u = User(username="anna", email="anna@example.com", role="user", team_id=team.id)
        u.set_password("p")
        db.session.add(u)
        db.session.commit()

        assert u.is_team_member() is True
        assert u.is_manager() is False
        assert u.team.slug == "ops"


def test_session_version_can_be_bumped(app):
    """Used by Task 7+ when super-admin moves a user between teams (R7.7)."""
    with app.app_context():
        u = User(username="moveme", email="moveme@example.com", role="user")
        u.set_password("p")
        db.session.add(u)
        db.session.commit()
        original = u.session_version

        u.session_version = original + 1
        db.session.commit()
        db.session.refresh(u)

        assert u.session_version == original + 1


def test_to_dict_includes_team_id_field(app):
    with app.app_context():
        team = _make_team("Sales")
        u = User(username="kasia", email="kasia@example.com", role="user", team_id=team.id)
        u.set_password("p")
        db.session.add(u)
        db.session.commit()

        data = u.to_dict()
        assert data["team_id"] == team.id
        # `team` key only present when expand_team=True
        assert "team" not in data


def test_to_dict_expand_team_returns_team_payload(app):
    with app.app_context():
        team = _make_team("Sales2")
        u = User(username="kasia2", email="kasia2@example.com", role="user", team_id=team.id)
        u.set_password("p")
        db.session.add(u)
        db.session.commit()

        data = u.to_dict(expand_team=True)
        assert data["team"]["name"] == "Sales2"
        assert data["team"]["slug"] == "sales2"


def test_to_dict_expand_team_for_super_admin_omits_team_key(app):
    """Super_admin has no team; expand_team=True must not crash, just skip the team field."""
    with app.app_context():
        a = User(username="root2", email="root2@example.com", role="super_admin")
        a.set_password("p")
        db.session.add(a)
        db.session.commit()

        data = a.to_dict(expand_team=True)
        assert data["team_id"] is None
        assert "team" not in data


def test_team_members_relationship_is_populated(app):
    """Team.members backref returns the User rows whose team_id matches."""
    with app.app_context():
        team = _make_team("Crew")
        for n in ("a", "b", "c"):
            u = User(username=n, email=f"{n}@example.com", role="user", team_id=team.id)
            u.set_password("p")
            db.session.add(u)
        db.session.commit()
        db.session.refresh(team)

        usernames = sorted(m.username for m in team.members)
        assert usernames == ["a", "b", "c"]
