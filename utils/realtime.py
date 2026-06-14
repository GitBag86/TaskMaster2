from datetime import datetime, timezone

from flask import g, session
from flask_socketio import join_room

from extensions import socketio
from models import Team, User, db


def emit_task_event(action, user, task=None, task_ids=None, task_id=None, task_payload=None, extra=None):
    payload = {
        "action": action,
        "user": user.username,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if task is not None:
        payload["task_id"] = task.id
        payload["task"] = task.to_dict()
    elif task_id is not None:
        payload["task_id"] = task_id
        payload["task"] = task_payload
    if task_ids is not None:
        payload["task_ids"] = task_ids
    if extra:
        payload.update(extra)
    team_id = task.team_id if task is not None else g.get('current_team_id')
    room = f"team:{team_id}" if team_id is not None else None
    socketio.emit("task_action", payload, room=room)


def emit_team_event(payload, team_id=None):
    target_team_id = team_id if team_id is not None else g.get('current_team_id')
    room = f"team:{target_team_id}" if target_team_id is not None else None
    socketio.emit("task_action", payload, room=room)


def socket_connect_handler():
    user_id = session.get("user_id")
    if not user_id:
        return False

    user = db.session.get(User, user_id)
    if user is None:
        return False

    # Session version check (H1): invalidate socket connections on team move/role change/archive
    session_version = session.get("session_version", 0)
    if user.session_version != session_version:
        return False

    if user.is_super_admin():
        join_room("super_admin")
        return None

    if user.team_id is None:
        return False

    team = db.session.get(Team, user.team_id)
    if team is None or team.archived:
        return False

    join_room(f"team:{user.team_id}")
    return None


def register_socketio_handlers():
    socketio.on_event("connect", socket_connect_handler)
