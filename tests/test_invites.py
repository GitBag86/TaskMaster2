from __future__ import annotations

from datetime import datetime, timedelta, timezone

from models import Team, TeamInvite, User, db
from routes.invites import hash_invite_token


def make_team(name: str) -> Team:
    team = Team(name=name, slug=name.lower().replace(" ", "-"))
    db.session.add(team)
    db.session.flush()
    return team


def make_user(username: str, team: Team, role: str = "manager") -> User:
    user = User(
        username=username,
        email=f"{username}@example.com",
        role=role,
        team_id=team.id,
        session_version=0,
    )
    user.set_password("password")
    db.session.add(user)
    db.session.flush()
    return user


def login_as(client, user: User) -> None:
    with client.session_transaction() as sess:
        sess["user_id"] = user.id
        sess["team_id"] = user.team_id
        sess["role"] = user.role
        sess["session_version"] = user.session_version


def signup_payload(username: str, token: str | None = None):
    payload = {
        "username": username,
        "password": "password123",
        "email": f"{username}@example.com",
        "accept_terms": True,
        "accept_privacy": True,
        "accept_marketing": False,
    }
    if token is not None:
        payload["invite_token"] = token
    return payload


def test_manager_creates_invite_and_list_hides_raw_token(client, app):
    with app.app_context():
        team = make_team("Invites A")
        manager = make_user("invite_manager", team)
        db.session.commit()
        login_as(client, manager)

    response = client.post("/team/invites", json={})
    assert response.status_code == 201
    created = response.get_json()
    assert created["default_role"] == "user"
    assert created["raw_token"]
    assert "token" not in created

    listed = client.get("/team/invites")
    assert listed.status_code == 200
    invite = listed.get_json()["invites"][0]
    assert invite["id"] == created["id"]
    assert "raw_token" not in invite
    assert "token" not in invite


def test_manager_cannot_create_manager_invite(client, app):
    with app.app_context():
        team = make_team("Role Invite")
        manager = make_user("role_invite_manager", team)
        db.session.commit()
        login_as(client, manager)

    response = client.post("/team/invites", json={"default_role": "manager"})
    assert response.status_code == 400


def test_invite_signup_consumes_token_once(client, app):
    app.config["SIGNUP_MODE"] = "invite_only"
    with app.app_context():
        team = make_team("Signup Team")
        manager = make_user("signup_invite_manager", team)
        db.session.commit()
        login_as(client, manager)

    created = client.post("/team/invites", json={}).get_json()
    raw_token = created["raw_token"]
    client.post("/auth/logout")

    signup = client.post("/auth/signup", json=signup_payload("invited_user", raw_token))
    assert signup.status_code == 201
    user_data = signup.get_json()["user"]
    assert user_data["team_id"] == created["team_id"]
    assert user_data["role"] == "user"

    with app.app_context():
        invite = db.session.get(TeamInvite, created["id"])
        assert invite.consumed_at is not None
        assert invite.consumed_by_id == user_data["id"]

    second = client.post("/auth/signup", json=signup_payload("invited_user_two", raw_token))
    assert second.status_code == 410
    assert second.get_json()["code"] == "invite_token_invalid"


def test_signup_info_previews_valid_invite_team(client, app):
    app.config["SIGNUP_MODE"] = "invite_only"
    raw_token = "preview-token"
    with app.app_context():
        team = make_team("Preview Team")
        invite = TeamInvite(
            team_id=team.id,
            token_hash=hash_invite_token(raw_token),
            expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=1),
            default_role="user",
        )
        db.session.add(invite)
        db.session.commit()

    response = client.get(f"/auth/signup-info?token={raw_token}")
    assert response.status_code == 200
    assert response.get_json() == {
        "mode": "invite_only",
        "team_name": "Preview Team",
        "token_valid": True,
    }


def test_signup_with_archived_team_invite_returns_team_archived(client, app):
    app.config["SIGNUP_MODE"] = "invite_only"
    raw_token = "archived-token"
    with app.app_context():
        team = make_team("Archived Invite")
        team.archived = True
        invite = TeamInvite(
            team_id=team.id,
            token_hash=hash_invite_token(raw_token),
            expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=1),
            default_role="user",
        )
        db.session.add(invite)
        db.session.commit()

    response = client.post("/auth/signup", json=signup_payload("archived_invited", raw_token))
    assert response.status_code == 403
    assert response.get_json()["code"] == "team_archived"


def test_signup_disabled_returns_stable_error_code(client, app):
    app.config["SIGNUP_MODE"] = "disabled"

    response = client.post("/auth/signup", json=signup_payload("disabled_signup"))

    assert response.status_code == 403
    assert response.get_json()["code"] == "signup_disabled"


def test_revoke_invite_removes_only_current_team_invite(client, app):
    with app.app_context():
        team_a = make_team("Revoke A")
        team_b = make_team("Revoke B")
        manager_a = make_user("revoke_manager_a", team_a)
        invite_b = TeamInvite(
            team_id=team_b.id,
            token_hash=hash_invite_token("other-team"),
            expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=1),
            default_role="user",
        )
        db.session.add(invite_b)
        db.session.commit()
        invite_b_id = invite_b.id
        login_as(client, manager_a)

    assert client.delete(f"/team/invites/{invite_b_id}").status_code == 404
    created = client.post("/team/invites", json={}).get_json()
    assert client.delete(f"/team/invites/{created['id']}").status_code == 204
