from flask import session
from flask_socketio import join_room

from extensions import socketio
from models import Team, User, db


def socket_connect_handler():
    user_id = session.get("user_id")
    if not user_id:
        return False

    user = db.session.get(User, user_id)
    if user is None:
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
