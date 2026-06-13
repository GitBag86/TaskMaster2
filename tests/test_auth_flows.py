from datetime import datetime, timedelta, timezone
import hashlib

from models import PasswordResetToken, Team, User, db


def test_logout_clears_session(auth_client):
    response = auth_client.post("/auth/logout")
    assert response.status_code == 200
    assert response.get_json()["message"] == "Wylogowano"

    with auth_client.session_transaction() as sess:
        assert "user_id" not in sess
        assert "team_id" not in sess


def test_get_current_user_returns_authenticated_user(auth_client, app):
    response = auth_client.get("/auth/me")
    assert response.status_code == 200
    data = response.get_json()
    assert data["username"] == "admin"
    assert data["email"] == "admin@example.com"
    assert data["role"] == "manager"
    assert "team" in data
    assert data["team"]["slug"] == "default"


def test_get_current_user_requires_login(client):
    response = client.get("/auth/me")
    assert response.status_code == 401
    assert "zalogowany" in response.get_json()["error"].lower()


def test_forgot_password_requires_email(client, app):
    response = client.post("/auth/forgot-password", json={})
    assert response.status_code == 400
    assert "e-mail" in response.get_json()["error"].lower()


def test_forgot_password_returns_success_for_unknown_email(client, app):
    response = client.post("/auth/forgot-password", json={"email": "nonexistent@example.com"})
    assert response.status_code == 200
    data = response.get_json()
    assert "e-mail" in data["message"].lower()


def test_forgot_password_creates_token_and_returns_success(auth_client, app, monkeypatch):
    sent = []

    def fake_send_password_reset_email(user, raw_token):
        sent.append({"user_id": user.id, "raw_token": raw_token})

    monkeypatch.setattr("utils.email_sender.send_password_reset_email", fake_send_password_reset_email)

    response = auth_client.post("/auth/forgot-password", json={"email": "admin@example.com"})
    assert response.status_code == 200

    with app.app_context():
        user = User.query.filter_by(email="admin@example.com").first()
        tokens = PasswordResetToken.query.filter_by(user_id=user.id).all()
        assert len(tokens) == 1
        assert tokens[0].is_active()

    assert len(sent) == 1
    assert sent[0]["user_id"] == user.id


def test_reset_password_requires_token(client, app):
    response = client.post("/auth/reset-password", json={"password": "newpassword123"})
    assert response.status_code == 400
    assert "token" in response.get_json()["error"].lower()


def test_reset_password_requires_minimum_length(client, app):
    response = client.post("/auth/reset-password", json={"token": "some-token", "password": "ab"})
    assert response.status_code == 400
    assert "6" in response.get_json()["error"]


def test_reset_password_rejects_invalid_token(client, app):
    response = client.post("/auth/reset-password", json={"token": "invalid-token", "password": "validpassword123"})
    assert response.status_code == 400
    assert "token" in response.get_json()["error"].lower()


def test_reset_password_succeeds_with_valid_token(client, app):
    with app.app_context():
        team = Team(name="ResetTeam", slug="resetteam")
        db.session.add(team)
        db.session.flush()
        user = User(username="resetuser", email="reset@example.com", role="user", team_id=team.id)
        user.set_password("oldpassword")
        db.session.add(user)
        db.session.flush()

        raw_token = "valid-reset-token-12345"
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        reset = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        db.session.add(reset)
        db.session.commit()
        user_id = user.id

    response = client.post("/auth/reset-password", json={
        "token": raw_token,
        "password": "newsecurepassword123",
    })
    assert response.status_code == 200
    assert "zmienione" in response.get_json()["message"].lower()

    with app.app_context():
        user = db.session.get(User, user_id)
        assert user.check_password("newsecurepassword123")
        reset = PasswordResetToken.query.filter_by(user_id=user_id).first()
        assert reset.consumed_at is not None


def test_reset_password_rejects_expired_token(client, app):
    with app.app_context():
        team = Team(name="ExpiredTeam", slug="expiredteam")
        db.session.add(team)
        db.session.flush()
        user = User(username="expireduser", email="expired@example.com", role="user", team_id=team.id)
        user.set_password("oldpassword")
        db.session.add(user)
        db.session.flush()

        raw_token = "expired-reset-token"
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        reset = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
        db.session.add(reset)
        db.session.commit()

    response = client.post("/auth/reset-password", json={
        "token": raw_token,
        "password": "newsecurepassword123",
    })
    assert response.status_code == 400
    assert "token" in response.get_json()["error"].lower()



