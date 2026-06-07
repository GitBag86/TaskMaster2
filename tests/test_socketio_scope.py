from __future__ import annotations

from datetime import datetime, timedelta, timezone

from flask import session

from models import Notification, Task, Team, User, db
from utils.realtime import emit_task_event, emit_team_event
from utils.notifications import emit_notification
from utils.realtime import socket_connect_handler


def make_team(name: str, archived: bool = False) -> Team:
    team = Team(name=name, slug=name.lower().replace(" ", "-"), archived=archived)
    db.session.add(team)
    db.session.flush()
    return team


def make_user(username: str, role: str, team_id: int | None = None) -> User:
    user = User(
        username=username,
        email=f"{username}@example.com",
        role=role,
        team_id=team_id,
        session_version=0,
    )
    user.set_password("password")
    db.session.add(user)
    db.session.flush()
    return user


def test_socket_connect_joins_current_team_room(app, monkeypatch):
    joined_rooms = []
    monkeypatch.setattr("utils.realtime.join_room", joined_rooms.append)

    with app.app_context():
        team = make_team("Socket A")
        user = make_user("socket_user", "manager", team.id)
        db.session.commit()
        user_id = user.id
        team_id = team.id

    with app.test_request_context("/socket.io"):
        session["user_id"] = user_id
        assert socket_connect_handler() is None

    assert joined_rooms == [f"team:{team_id}"]


def test_socket_connect_joins_super_admin_room(app, monkeypatch):
    joined_rooms = []
    monkeypatch.setattr("utils.realtime.join_room", joined_rooms.append)

    with app.app_context():
        user = make_user("socket_super", "super_admin", None)
        db.session.commit()
        user_id = user.id

    with app.test_request_context("/socket.io"):
        session["user_id"] = user_id
        assert socket_connect_handler() is None

    assert joined_rooms == ["super_admin"]


def test_socket_connect_rejects_archived_team(app, monkeypatch):
    joined_rooms = []
    monkeypatch.setattr("utils.realtime.join_room", joined_rooms.append)

    with app.app_context():
        team = make_team("Socket Archived", archived=True)
        user = make_user("socket_archived", "manager", team.id)
        db.session.commit()
        user_id = user.id

    with app.test_request_context("/socket.io"):
        session["user_id"] = user_id
        assert socket_connect_handler() is False

    assert joined_rooms == []


def test_emit_task_event_targets_task_team_room(app, monkeypatch):
    emitted = {}

    def fake_emit(event_name, payload, **kwargs):
        emitted["event_name"] = event_name
        emitted["payload"] = payload
        emitted["kwargs"] = kwargs

    monkeypatch.setattr("utils.realtime.socketio.emit", fake_emit)

    with app.app_context():
        team = make_team("Emit Task")
        user = make_user("emit_task_user", "manager", team.id)
        task = Task(user_id=user.id, title="Roomed task", team_id=team.id)
        db.session.add(task)
        db.session.commit()
        task_id = task.id
        team_id = team.id
        emit_task_event("updated", user, task=task)

    assert emitted["event_name"] == "task_action"
    assert emitted["payload"]["task_id"] == task_id
    assert emitted["kwargs"]["room"] == f"team:{team_id}"


def test_emit_notification_targets_notification_team_room(app, monkeypatch):
    emitted = {}

    def fake_emit(event_name, payload, **kwargs):
        emitted["event_name"] = event_name
        emitted["payload"] = payload
        emitted["kwargs"] = kwargs

    monkeypatch.setattr("utils.notifications.socketio.emit", fake_emit)

    with app.app_context():
        team = make_team("Emit Notification")
        user = make_user("emit_notification_user", "manager", team.id)
        notification = Notification(
            user_id=user.id,
            team_id=team.id,
            type="assignment",
            message="Scoped notification",
            created_at=datetime.now(timezone.utc) - timedelta(seconds=1),
        )
        db.session.add(notification)
        db.session.commit()
        notification_id = notification.id
        team_id = team.id
        emit_notification(notification)

    assert emitted["event_name"] == "notification"
    assert emitted["payload"]["id"] == notification_id
    assert emitted["kwargs"]["room"] == f"team:{team_id}"


def test_emit_team_event_targets_specified_team_room(app, monkeypatch):
    emitted = []

    def fake_emit(event_name, payload, **kwargs):
        emitted.append({"event_name": event_name, "payload": payload, "kwargs": kwargs})

    monkeypatch.setattr("utils.realtime.socketio.emit", fake_emit)

    with app.app_context():
        team_a = make_team("Team A")
        team_b = make_team("Team B")
        user = make_user("emit_team_user", "manager", team_a.id)
        db.session.commit()

        payload = {
            "action": "project_created",
            "user": user.username,
            "timestamp": "2024-01-01T00:00:00",
        }

        emit_team_event(payload, team_id=team_b.id)

    assert len(emitted) == 1
    assert emitted[0]["event_name"] == "task_action"
    assert emitted[0]["kwargs"]["room"] == f"team:{team_b.id}"


def test_emit_team_event_falls_back_to_current_team(app, monkeypatch):
    emitted = []

    def fake_emit(event_name, payload, **kwargs):
        emitted.append({"event_name": event_name, "payload": payload, "kwargs": kwargs})

    monkeypatch.setattr("utils.realtime.socketio.emit", fake_emit)

    with app.app_context():
        team = make_team("Fallback Team")
        user = make_user("fallback_user", "manager", team.id)
        db.session.commit()

        payload = {
            "action": "project_created",
            "user": user.username,
            "timestamp": "2024-01-01T00:00:00",
        }

        with app.test_request_context():
            from flask import g
            g.current_team_id = team.id
            emit_team_event(payload)

    assert len(emitted) == 1
    assert emitted[0]["kwargs"]["room"] == f"team:{team.id}"
