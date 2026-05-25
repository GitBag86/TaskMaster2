from flask import g, jsonify, request, session

from models import db, Notification
from routes import notifications_bp
from routes.auth import login_required
from utils.scoping import team_scoped


@notifications_bp.route('/notifications', methods=['GET'])
@login_required
def get_notifications():
    user_id = session.get('user_id')
    limit = min(request.args.get('limit', 20, type=int), 100)
    unread_only = request.args.get('unread_only', 'false').lower() == 'true'

    query = team_scoped(Notification.query, Notification).filter_by(user_id=user_id)
    unread_count = query.filter_by(read=False).count()
    if unread_only:
        query = query.filter_by(read=False)

    notifications = query.order_by(Notification.created_at.desc()).limit(limit).all()
    return jsonify({
        'notifications': [notification.to_dict() for notification in notifications],
        'unread_count': unread_count,
    })


@notifications_bp.route('/notifications/<int:notification_id>/read', methods=['POST'])
@login_required
def mark_notification_read(notification_id):
    user_id = session.get('user_id')
    notification = db.session.get(Notification, notification_id)
    if (
        not notification
        or notification.user_id != user_id
        or notification.team_id != g.get('current_team_id')
    ):
        return jsonify({"error": "Not found"}), 404

    notification.read = True
    db.session.commit()
    return jsonify(notification.to_dict())


@notifications_bp.route('/notifications/read-all', methods=['POST'])
@login_required
def mark_all_notifications_read():
    user_id = session.get('user_id')
    team_scoped(Notification.query, Notification).filter_by(user_id=user_id, read=False).update({'read': True})
    db.session.commit()
    return jsonify({'message': 'Oznaczono wszystkie powiadomienia jako przeczytane', 'unread_count': 0})
