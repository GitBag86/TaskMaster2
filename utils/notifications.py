from extensions import socketio
from models import db, Notification
from utils.socket_rooms import user_room


def create_notification(user_id, notification_type, message, task=None, actor=None):
    notification = Notification(
        user_id=user_id,
        task_id=task.id if task else None,
        actor=actor.username if actor else None,
        type=notification_type,
        message=message,
    )
    db.session.add(notification)
    db.session.flush()
    return notification


def emit_notification(notification):
    socketio.emit("notification", notification.to_dict(), to=user_room(notification.user_id))


def emit_notifications(notifications):
    for notification in notifications:
        emit_notification(notification)
