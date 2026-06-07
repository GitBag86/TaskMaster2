"""Tests for Flask-WTF CSRF protection.

Covers:
- State-changing requests (POST/PUT/DELETE) without CSRF token are rejected.
- GET requests and exempt public endpoints bypass CSRF.
- /csrf-token endpoint returns a valid token.
"""

import pytest
from config import Config


class CsrfEnabledConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SECRET_KEY = "test-secret-key"
    SESSION_COOKIE_SECURE = False
    ENABLE_SCHEDULER = False
    RATELIMIT_ENABLED = False
    WTF_CSRF_ENABLED = True
    MAIL_SUPPRESS_SEND = True
    MAIL_ASYNC = False


@pytest.fixture
def csrf_app():
    from app import create_app
    from models import db

    app = create_app(CsrfEnabledConfig)
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(csrf_app):
    return csrf_app.test_client()


@pytest.fixture
def auth_client(client, csrf_app):
    """A client with a logged-in team manager."""
    from models import Team, User, db

    with csrf_app.app_context():
        team = Team(name="Default", slug="default")
        db.session.add(team)
        db.session.flush()
        admin = User(username="admin", email="admin@example.com", role="manager", team_id=team.id)
        admin.set_password("password")
        db.session.add(admin)
        db.session.commit()

        with client.session_transaction() as sess:
            sess['user_id'] = admin.id
            sess['team_id'] = team.id
            sess['role'] = admin.role
            sess['session_version'] = admin.session_version

        return client


def test_csrf_token_endpoint_returns_token(auth_client):
    """GET /csrf-token returns a CSRF token."""
    response = auth_client.get("/csrf-token")
    assert response.status_code == 200
    data = response.get_json()
    assert "csrf_token" in data
    assert len(data["csrf_token"]) > 0


def _create_task_with_token(auth_client):
    """Helper: create a task with a valid CSRF token and return (task_id, token)."""
    token_resp = auth_client.get("/csrf-token")
    token = token_resp.get_json()["csrf_token"]
    resp = auth_client.post(
        "/tasks",
        json={"title": "CSRF test task"},
        headers={"X-CSRFToken": token},
    )
    assert resp.status_code == 201
    return resp.get_json()["id"], token


def test_csrf_rejects_post_without_token(auth_client):
    """POST /tasks without CSRF token is rejected with 400."""
    response = auth_client.post("/tasks", json={"title": "CSRF test"})
    assert response.status_code == 400


def test_csrf_rejects_put_without_token(auth_client):
    """PUT /tasks/:id without CSRF token is rejected with 400."""
    task_id, _ = _create_task_with_token(auth_client)
    response = auth_client.put(f"/tasks/{task_id}", json={"title": "Hacked"})
    assert response.status_code == 400


def test_csrf_rejects_delete_without_token(auth_client):
    """DELETE /tasks/:id without CSRF token is rejected with 400."""
    task_id, _ = _create_task_with_token(auth_client)
    response = auth_client.delete(f"/tasks/{task_id}")
    assert response.status_code == 400


def test_csrf_allows_request_with_valid_token(auth_client):
    """State-changing requests with valid CSRF token succeed."""
    token_resp = auth_client.get("/csrf-token")
    token = token_resp.get_json()["csrf_token"]
    response = auth_client.post(
        "/tasks",
        json={"title": "Valid CSRF task"},
        headers={"X-CSRFToken": token},
    )
    assert response.status_code == 201
    assert response.get_json()["title"] == "Valid CSRF task"


def test_csrf_allows_get_requests_without_token(auth_client):
    """GET requests bypass CSRF protection."""
    response = auth_client.get("/tasks")
    assert response.status_code == 200


def test_csrf_exempts_public_auth_endpoints(auth_client, csrf_app):
    """Login and signup POST endpoints work without CSRF token (no session yet)."""
    from models import User, db
    with csrf_app.app_context():
        user = User(username="csrf_login_test", email="csrf_login@example.com", role="user")
        user.set_password("password")
        db.session.add(user)
        db.session.commit()

    # Login should work without any CSRF token
    response = auth_client.post(
        "/auth/login",
        json={"username": "csrf_login_test", "password": "password"},
    )
    assert response.status_code == 200, response.get_json()
    assert "user" in response.get_json()


def test_csrf_rejects_invalid_token(auth_client):
    """Invalid CSRF token is rejected with 400."""
    response = auth_client.post(
        "/tasks",
        json={"title": "Bad token"},
        headers={"X-CSRFToken": "invalid-token"},
    )
    assert response.status_code == 400
