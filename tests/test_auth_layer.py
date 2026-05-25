"""Tests for the request-scoped authorization layer (Task 4 of team-workspaces).

Covers:
- Public paths (/health, /ready, /version) bypass auth.
- Anonymous request to a team-scoped endpoint -> 401.
- Stale session_version -> 401 with code session_stale, session cleared.
- Archived team -> 403 with code team_archived.
- Authenticated request populates g.current_user / g.current_team_id / g.current_role.
- Decorators: require_role rejects wrong role with 403, missing auth with 401.
- Helpers: team_scoped filters by g.current_team_id, returns empty when no team.
- get_team_resource_or_404 returns None for cross-team access (R9.4).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from flask import g, jsonify

from models import Team, User, db
from utils.auth_decorators import require_role, require_super_admin, require_team_member
from utils.scoping import get_team_resource_or_404, team_scoped


def utcnow_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _make_team(name: str = "Marketing") -> Team:
    team = Team(name=name, slug=name.lower())
    db.session.add(team)
    db.session.flush()
    return team


def _make_user(username: str, role: str = "user", team_id: int | None = None) -> User:
    user = User(username=username, email=f"{username}@x.com", role=role, team_id=team_id)
    user.set_password("p")
    db.session.add(user)
    db.session.flush()
    return user


# ---------- Public paths ----------

def test_health_endpoint_bypasses_auth_layer(client):
    response = client.get("/health")
    assert response.status_code == 200


def test_ready_endpoint_bypasses_auth_layer(client):
    response = client.get("/ready")
    assert response.status_code == 200


def test_version_endpoint_bypasses_auth_layer(client):
    response = client.get("/version")
    assert response.status_code == 200


def test_login_endpoint_bypasses_auth_layer(client):
    # No session yet — should return 400/401 from validation, not from auth layer.
    response = client.post("/auth/login", json={"username": "x", "password": "y"})
    assert response.status_code == 401
    # Body should be the standard "wrong creds" error, not session_*
    assert response.get_json().get("code") not in ("session_stale", "session_invalid")


# ---------- Anonymous access ----------

def test_anonymous_request_to_protected_endpoint_returns_401(client):
    """Without a session, /tasks (login_required) returns 401."""
    response = client.get("/tasks")
    assert response.status_code == 401


# ---------- Session staleness ----------

def test_stale_session_version_returns_401_and_clears_session(client, app):
    with app.app_context():
        user = _make_user("staletest", role="user", team_id=_make_team("ST").id)
        db.session.commit()
        user.session_version = 5  # bump server-side
        db.session.commit()
        user_id = user.id

    with client.session_transaction() as sess:
        sess["user_id"] = user_id
        sess["session_version"] = 0  # client thinks version is still 0 — STALE
        sess["team_id"] = None
        sess["role"] = "user"

    response = client.get("/tasks")
    assert response.status_code == 401
    body = response.get_json()
    assert body.get("code") == "session_stale"

    # After the rejection the session must be cleared.
    with client.session_transaction() as sess:
        assert "user_id" not in sess


def test_user_id_pointing_to_deleted_user_returns_401(client, app):
    with client.session_transaction() as sess:
        sess["user_id"] = 99999  # nonexistent
        sess["session_version"] = 0

    response = client.get("/tasks")
    assert response.status_code == 401
    assert response.get_json().get("code") == "session_invalid"


# ---------- Archived team ----------

def test_archived_team_blocks_access_with_team_archived_code(client, app):
    with app.app_context():
        team = _make_team("Archived")
        team.archived = True
        db.session.flush()
        user = _make_user("archtest", role="user", team_id=team.id)
        db.session.commit()
        user_id = user.id
        ver = user.session_version

    with client.session_transaction() as sess:
        sess["user_id"] = user_id
        sess["session_version"] = ver

    response = client.get("/tasks")
    assert response.status_code == 403
    assert response.get_json().get("code") == "team_archived"


# ---------- Successful auth populates g ----------

def test_successful_auth_populates_request_context(client, app):
    """Probe `g` via a stub route that mirrors what real handlers will see."""
    with app.app_context():
        team = _make_team("CTX")
        user = _make_user("ctxuser", role="manager", team_id=team.id)
        db.session.commit()
        user_id, team_id, ver = user.id, team.id, user.session_version

        # Register a stub endpoint that returns the resolved context as JSON.
        @app.route("/__test/context")
        def _context_probe():
            return jsonify({
                "user_id": g.current_user.id if g.get("current_user") else None,
                "team_id": g.get("current_team_id"),
                "role": g.get("current_role"),
            })

    with client.session_transaction() as sess:
        sess["user_id"] = user_id
        sess["session_version"] = ver

    response = client.get("/__test/context")
    assert response.status_code == 200
    assert response.get_json() == {
        "user_id": user_id,
        "team_id": team_id,
        "role": "manager",
    }


# ---------- Decorators ----------

def test_require_role_rejects_anonymous_with_401(client, app):
    with app.app_context():

        @app.route("/__test/manager_only")
        @require_role("manager")
        def _stub():
            return jsonify({"ok": True})

    response = client.get("/__test/manager_only")
    assert response.status_code == 401


def test_require_role_rejects_wrong_role_with_403(client, app):
    with app.app_context():
        team = _make_team("Roles")
        user = _make_user("regularjoe", role="user", team_id=team.id)
        db.session.commit()
        user_id, ver = user.id, user.session_version

        @app.route("/__test/manager_only_2")
        @require_role("manager")
        def _stub2():
            return jsonify({"ok": True})

    with client.session_transaction() as sess:
        sess["user_id"] = user_id
        sess["session_version"] = ver

    response = client.get("/__test/manager_only_2")
    assert response.status_code == 403


def test_require_team_member_accepts_manager(client, app):
    with app.app_context():
        team = _make_team("TM1")
        user = _make_user("mgrjoe", role="manager", team_id=team.id)
        db.session.commit()
        user_id, ver = user.id, user.session_version

        @app.route("/__test/team_member")
        @require_team_member
        def _stub_tm():
            return jsonify({"ok": True})

    with client.session_transaction() as sess:
        sess["user_id"] = user_id
        sess["session_version"] = ver

    response = client.get("/__test/team_member")
    assert response.status_code == 200


def test_require_super_admin_rejects_manager(client, app):
    with app.app_context():
        team = _make_team("SA1")
        user = _make_user("manageronly", role="manager", team_id=team.id)
        db.session.commit()
        user_id, ver = user.id, user.session_version

        @app.route("/__test/super_only")
        @require_super_admin
        def _stub_sa():
            return jsonify({"ok": True})

    with client.session_transaction() as sess:
        sess["user_id"] = user_id
        sess["session_version"] = ver

    response = client.get("/__test/super_only")
    assert response.status_code == 403


# ---------- team_scoped helper ----------

def test_team_scoped_filters_by_current_team(client, app):
    with app.app_context():
        team_a = _make_team("ScopeA")
        team_b = _make_team("ScopeB")
        user_a = _make_user("scopeuser_a", role="manager", team_id=team_a.id)
        user_b = _make_user("scopeuser_b", role="manager", team_id=team_b.id)
        db.session.commit()
        user_a_id, ver_a = user_a.id, user_a.session_version
        team_b_id = team_b.id

        @app.route("/__test/scope_team_count")
        def _scope_count():
            # Try to count Users in current team via team_scoped helper.
            q = team_scoped(User.query, User)
            count = q.count()
            return jsonify({"count": count, "team_id": g.get("current_team_id")})

    with client.session_transaction() as sess:
        sess["user_id"] = user_a_id
        sess["session_version"] = ver_a

    response = client.get("/__test/scope_team_count")
    body = response.get_json()
    # User A is in team A -> sees only users with team_id == team_a (just self).
    assert body["count"] == 1
    assert body["team_id"] != team_b_id


def test_team_scoped_returns_empty_for_super_admin(client, app):
    """Super_admin on a regular team-scoped endpoint -> empty list (R9.6)."""
    with app.app_context():
        super_user = _make_user("supex", role="super_admin", team_id=None)
        db.session.commit()
        user_id, ver = super_user.id, super_user.session_version
        # Add some users in some team that the super_admin should NOT see on /tasks.
        team = _make_team("SuperBlind")
        _make_user("blind1", role="user", team_id=team.id)
        _make_user("blind2", role="user", team_id=team.id)
        db.session.commit()

        @app.route("/__test/scope_for_super")
        def _scope_super():
            q = team_scoped(User.query, User)
            return jsonify({"count": q.count()})

    with client.session_transaction() as sess:
        sess["user_id"] = user_id
        sess["session_version"] = ver

    response = client.get("/__test/scope_for_super")
    assert response.get_json()["count"] == 0


# ---------- get_team_resource_or_404 helper ----------

def test_get_team_resource_returns_obj_when_same_team(client, app):
    with app.app_context():
        team = _make_team("ResA")
        owner = _make_user("ownera", role="manager", team_id=team.id)
        db.session.commit()
        target_id, ver = owner.id, owner.session_version

        @app.route("/__test/get_resource/<int:rid>")
        def _get_res(rid):
            obj = get_team_resource_or_404(User, rid)
            return jsonify({"found": obj is not None, "id": obj.id if obj else None})

    with client.session_transaction() as sess:
        sess["user_id"] = target_id
        sess["session_version"] = ver

    response = client.get(f"/__test/get_resource/{target_id}")
    assert response.get_json() == {"found": True, "id": target_id}


def test_get_team_resource_returns_none_for_cross_team(client, app):
    """R9.4 — accessing another team's resource by id is indistinguishable from non-existent."""
    with app.app_context():
        team_a = _make_team("CrossA")
        team_b = _make_team("CrossB")
        user_a = _make_user("crossa", role="user", team_id=team_a.id)
        user_b = _make_user("crossb", role="user", team_id=team_b.id)  # belongs to team B
        db.session.commit()
        user_a_id, ver_a = user_a.id, user_a.session_version
        user_b_id = user_b.id  # we'll try to fetch this from A's session

        @app.route("/__test/get_cross/<int:rid>")
        def _get_cross(rid):
            obj = get_team_resource_or_404(User, rid)
            return jsonify({"found": obj is not None})

    with client.session_transaction() as sess:
        sess["user_id"] = user_a_id
        sess["session_version"] = ver_a

    # User A asks for User B (different team) -> None
    response = client.get(f"/__test/get_cross/{user_b_id}")
    assert response.get_json() == {"found": False}
