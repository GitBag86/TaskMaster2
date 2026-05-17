from flask import request, jsonify, session
from routes import users_bp
from models import db, User
from routes.auth import login_required

@users_bp.route('/users', methods=['GET'])
@login_required
def get_users():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if user.role != 'admin':
        return jsonify({"error": "Tylko administrator może przeglądać użytkowników"}), 403

    users = User.query.all()
    return jsonify({"users": [u.to_dict() for u in users]})

@users_bp.route('/users/<int:target_user_id>/role', methods=['PUT'])
@login_required
def update_user_role(target_user_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if user.role != 'admin':
        return jsonify({"error": "Tylko administrator może zmieniać role"}), 403

    target_user = db.session.get(User, target_user_id)
    if not target_user:
        return jsonify({"error": "Użytkownik nie znaleziony"}), 404

    data = request.get_json()
    new_role = data.get('role')
    if new_role not in ['user', 'admin']:
        return jsonify({"error": "Nieprawidłowa rola"}), 400

    target_user.role = new_role
    db.session.commit()

    return jsonify({"message": f"Zmieniono rolę użytkownika {target_user.username} na {new_role}"}), 200
