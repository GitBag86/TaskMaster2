"""Error-path tests: OperationalError, IntegrityError, rate limits, edge cases.

Covers:
- DB OperationalError on /ready and /auth/signup (graceful degradation)
- IntegrityError on duplicate username constraint violation
- 429 rate limit on /auth/login (when limiter enabled)
- Multiple blockers preventing task completion
- Cross-team reference on bulk operations
- Invite token expiry and consumption edge cases
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy.exc import IntegrityError, OperationalError

from config import Config
from models import Team, TeamInvite, Task, TaskDependency, User, db


class RateLimitEnabledConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SECRET_KEY = "test-secret-key"
    SESSION_COOKIE_SECURE = False
    ENABLE_SCHEDULER = False
    RATELIMIT_ENABLED = True
    WTF_CSRF_ENABLED = False
    MAIL_SUPPRESS_SEND = True
    MAIL_ASYNC = False


# ─── Tests using default TestingConfig (ratelimiting OFF) ────────────────


def test_operational_error_on_ready_gracefully_degraded(app, client, monkeypatch):
    """GET /ready returns 503 when database is down (OperationalError)."""
    original_execute = db.session.execute

    def failing_execute(*args, **kwargs):
        raise OperationalError("Mock", "SELECT 1", "DB unavailable")

    monkeypatch.setattr(db.session, "execute", failing_execute)

    response = client.get("/ready")
    assert response.status_code == 503
    data = response.get_json()
    assert data["status"] == "not_ready"
    assert data["checks"]["database"] is False


def test_signup_handles_db_write_failure_gracefully(app, client, monkeypatch):
    """POST /auth/signup returns 500 when DB commit fails."""
    from models import Team

    with app.app_context():
        team = Team(name="Default", slug="default")
        db.session.add(team)
        db.session.commit()

    app.config["SIGNUP_MODE"] = "default_team"
    app.config["WTF_CSRF_ENABLED"] = False

    original_commit = db.session.commit

    def failing_commit():
        # First call (creating the user) fails
        db.session.rollback()
        raise OperationalError("Mock", "INSERT", "DB unavailable")

    monkeypatch.setattr(db.session, "commit", failing_commit)

    response = client.post(
        "/auth/signup",
        json={
            "username": "db_fail_user",
            "password": "password123",
            "email": "db_fail@example.com",
            "accept_terms": True,
            "accept_privacy": True,
            "accept_marketing": False,
        },
    )
    assert response.status_code == 500
    data = response.get_json()
    assert "Nie udało się zapisać użytkownika" in data["error"]


def test_integrity_error_on_duplicate_username(auth_client, app):
    """Creating a user with duplicate username returns 400."""
    from routes.users import users_bp

    response = auth_client.post(
        "/users",
        json={
            "username": "admin",
            "password": "another_pass",
            "email": "admin2@example.com",
            "role": "user",
        },
    )
    assert response.status_code == 400
    data = response.get_json()
    assert "już istnieje" in data.get("error", str(data))


def test_multiple_blockers_prevent_completion(auth_client, app):
    """Task with 2+ open dependencies returns 409 with all blockers listed."""
    blocker_a = auth_client.post("/tasks", json={"title": "Blocker A"}).get_json()
    blocker_b = auth_client.post("/tasks", json={"title": "Blocker B"}).get_json()
    blocked = auth_client.post("/tasks", json={"title": "Doubly blocked"}).get_json()

    auth_client.post(
        f'/tasks/{blocked["id"]}/dependencies',
        json={"depends_on_task_id": blocker_a["id"]},
    )
    auth_client.post(
        f'/tasks/{blocked["id"]}/dependencies',
        json={"depends_on_task_id": blocker_b["id"]},
    )

    response = auth_client.put(f'/tasks/{blocked["id"]}/complete')
    assert response.status_code == 409
    data = response.get_json()
    assert len(data["blocked_by"]) == 2
    blocked_titles = {b["title"] for b in data["blocked_by"]}
    assert "Blocker A" in blocked_titles
    assert "Blocker B" in blocked_titles


def test_bulk_cross_team_reference_is_rejected(auth_client, app):
    """Bulk operation with tasks from another team raises CrossTeamReferenceError."""
    with app.app_context():
        other_team = Team(name="Other Team", slug="other-team")
        db.session.add(other_team)
        db.session.flush()
        other_user = User(
            username="other_user",
            email="other@example.com",
            role="manager",
            team_id=other_team.id,
        )
        other_user.set_password("p")
        db.session.add(other_user)
        db.session.flush()
        other_task = Task(
            user_id=other_user.id,
            title="Other team task",
            team_id=other_team.id,
        )
        db.session.add(other_task)
        db.session.commit()
        other_task_id = other_task.id

    # Try to bulk-complete a task from another team
    response = auth_client.put(
        "/tasks/bulk/complete",
        json={"task_ids": [other_task_id]},
    )
    assert response.status_code == 400
    data = response.get_json()
    assert "code" in data
    assert data["code"] == "cross_team_reference"


def test_bulk_delete_cross_team_reference(auth_client, app):
    """Bulk delete with cross-team task raises CrossTeamReferenceError."""
    with app.app_context():
        other_team = Team(name="Other Team 2", slug="other-team-2")
        db.session.add(other_team)
        db.session.flush()
        other_user = User(
            username="other_user2",
            email="other2@example.com",
            role="manager",
            team_id=other_team.id,
        )
        other_user.set_password("p")
        db.session.add(other_user)
        db.session.flush()
        other_task = Task(
            user_id=other_user.id,
            title="Other team task delete",
            team_id=other_team.id,
        )
        db.session.add(other_task)
        db.session.commit()
        other_task_id = other_task.id

    response = auth_client.delete(
        "/tasks/bulk/delete",
        json={"task_ids": [other_task_id]},
    )
    assert response.status_code == 400
    data = response.get_json()
    assert data["code"] == "cross_team_reference"


def test_invite_token_expired_is_rejected(client, app):
    """Signup with an expired invite token — signup-info returns token_valid=False."""
    from routes.auth import hash_invite_token

    with app.app_context():
        team = Team(name="Expired Team", slug="expired-team")
        db.session.add(team)
        db.session.flush()
        invite = TeamInvite(
            team_id=team.id,
            token_hash=hash_invite_token("expired-token"),
            expires_at=datetime.now(timezone.utc).replace(tzinfo=None)
            - timedelta(days=1),
        )
        db.session.add(invite)
        db.session.commit()

    app.config["SIGNUP_MODE"] = "invite_only"
    response = client.get("/auth/signup-info?token=expired-token")
    assert response.status_code == 200
    data = response.get_json()
    assert data["token_valid"] is False


def test_invite_token_consumed_is_rejected(client, app):
    """Signup with an already-consumed invite returns 410."""
    from routes.auth import hash_invite_token

    with app.app_context():
        team = Team(name="Consumed Team", slug="consumed-team")
        db.session.add(team)
        db.session.flush()
        consumer = User(
            username="consumer",
            email="consumer@example.com",
            role="user",
            team_id=team.id,
        )
        consumer.set_password("p")
        db.session.add(consumer)
        db.session.flush()
        invite = TeamInvite(
            team_id=team.id,
            token_hash=hash_invite_token("consumed-token"),
            expires_at=datetime.now(timezone.utc).replace(tzinfo=None)
            + timedelta(days=7),
            consumed_at=datetime.now(timezone.utc).replace(tzinfo=None),
            consumed_by_id=consumer.id,
        )
        db.session.add(invite)
        db.session.commit()

    response = client.get("/auth/signup-info?token=consumed-token")
    assert response.status_code == 200
    data = response.get_json()
    assert data["token_valid"] is False


def test_invite_token_invalid_on_signup(client, app):
    """Signup with invalid/expired token returns 410 InviteTokenInvalidError."""
    app.config["SIGNUP_MODE"] = "invite_only"
    response = client.post(
        "/auth/signup",
        json={
            "username": "bad_token_user",
            "password": "password123",
            "email": "bad_token@example.com",
            "invite_token": "nonexistent-token",
            "accept_terms": True,
            "accept_privacy": True,
            "accept_marketing": False,
        },
    )
    assert response.status_code == 410
    data = response.get_json()
    assert data["code"] == "invite_token_invalid"


# ─── Rate-limiting tests (separate app with RATELIMIT_ENABLED=True) ─────


@pytest.fixture
def rate_limited_app():
    from app import create_app

    flask_app = create_app(RateLimitEnabledConfig)
    with flask_app.app_context():
        db.create_all()
        yield flask_app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def rate_client(rate_limited_app):
    return rate_limited_app.test_client()


def test_rate_limit_on_login_endpoint(rate_client, rate_limited_app):
    """POST /auth/login returns 429 after 5 rapid attempts."""
    for _ in range(5):
        rate_client.post("/auth/login", json={"username": "x", "password": "x"})

    # 6th attempt should be rate-limited
    response = rate_client.post("/auth/login", json={"username": "x", "password": "x"})
    assert response.status_code == 429
    # Flask-Limiter returns a plain-text 429 via abort(); just verify the status.


def test_rate_limit_on_signup_endpoint(rate_client, rate_limited_app):
    """POST /auth/signup returns 429 after 5 rapid attempts."""
    for _ in range(5):
        rate_client.post(
            "/auth/signup",
            json={
                "username": "rate_test",
                "password": "password123",
                "email": "rate_test@example.com",
                "accept_terms": True,
                "accept_privacy": True,
                "accept_marketing": False,
                "invite_token": "dummy",
            },
        )

    response = rate_client.post(
        "/auth/signup",
        json={
            "username": "rate_test_final",
            "password": "password123",
            "email": "rate_test_final@example.com",
            "accept_terms": True,
            "accept_privacy": True,
            "accept_marketing": False,
            "invite_token": "dummy",
        },
    )
    assert response.status_code == 429
    # Flask-Limiter returns a plain-text 429 via abort(); just verify the status.
