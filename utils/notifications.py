from extensions import socketio
from models import db, Notification


def create_notification(user_id, notification_type, message, task=None, actor=None, team_id=None):
    notification_team_id = team_id if team_id is not None else (task.team_id if task else None)
    notification = Notification(
        user_id=user_id,
        task_id=task.id if task else None,
        team_id=notification_team_id,
        actor=actor.username if actor else None,
        type=notification_type,
        message=message,
    )
    db.session.add(notification)
    db.session.flush()
    return notification


def emit_notification(notification):
    room = f"team:{notification.team_id}" if notification.team_id is not None else None
    socketio.emit("notification", notification.to_dict(), room=room)


def emit_notifications(notifications):
    for notification in notifications:
        emit_notification(notification)
