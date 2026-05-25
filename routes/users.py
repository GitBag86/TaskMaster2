from flask import g, request, jsonify, session
from marshmallow import ValidationError
from routes import users_bp
from models import (
    ActivityLog,
    CustomField,
    SavedFilter,
    Tag,
    TaskTemplate,
    User,
    db,
    task_assignees,
)
from routes.auth import login_required
from schemas import AdminUserCreateSchema


def current_admin_or_error(action):
    user = db.session.get(User, session.get('user_id'))
    if not user or g.get('current_role') not in ('manager', 'super_admin'):
        return None, jsonify({"error": f"Tylko administrator może {action}"}), 403
    return user, None, None


def admin_count():
    return User.query.filter(User.role.in_(('admin', 'manager', 'super_admin'))).count()

@users_bp.route('/users', methods=['GET'])
@login_required
def get_users():
    _, error, status = current_admin_or_error("przeglądać użytkowników")
    if error:
        return error, status

    users = User.query.all()
    return jsonify({"users": [u.to_dict() for u in users]})


@users_bp.route('/users', methods=['POST'])
@login_required
def create_user():
    _, error, status = current_admin_or_error("dodawać użytkowników")
    if error:
        return error, status

    schema = AdminUserCreateSchema()
    try:
        validated = schema.load(request.get_json() or {})
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    username = validated["username"].strip()
    email = validated["email"].strip().lower()

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Użytkownik o tej nazwie już istnieje"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Użytkownik z tym adresem e-mail już istnieje"}), 400

    role = 'manager' if validated["role"] == 'admin' else validated["role"]
    new_user = User(username=username, email=email, role=role, team_id=g.get('current_team_id'))
    new_user.set_password(validated["password"])
    db.session.add(new_user)
    db.session.commit()

    return jsonify({"message": "Użytkownik dodany", "user": new_user.to_dict()}), 201

@users_bp.route('/users/<int:target_user_id>/role', methods=['PUT'])
@login_required
def update_user_role(target_user_id):
    user, error, status = current_admin_or_error("zmieniać role")
    if error:
        return error, status

    target_user = db.session.get(User, target_user_id)
    if not target_user:
        return jsonify({"error": "Użytkownik nie znaleziony"}), 404

    data = request.get_json() or {}
    new_role = data.get('role')
    if new_role not in ['user', 'manager', 'admin']:
        return jsonify({"error": "Nieprawidłowa rola"}), 400
    new_role = 'manager' if new_role == 'admin' else new_role

    if target_user.id == user.id and new_role != 'manager':
        return jsonify({"error": "Nie możesz odebrać roli admina samemu sobie"}), 400

    if target_user.role in ('admin', 'manager', 'super_admin') and new_role != 'manager' and admin_count() <= 1:
        return jsonify({"error": "Nie można odebrać roli ostatniemu administratorowi"}), 400

    target_user.role = new_role
    db.session.commit()

    return jsonify({"message": f"Zmieniono rolę użytkownika {target_user.username} na {new_role}"}), 200


@users_bp.route('/users/<int:target_user_id>', methods=['DELETE'])
@login_required
def delete_user(target_user_id):
    user, error, status = current_admin_or_error("usuwać użytkowników")
    if error:
        return error, status

    target_user = db.session.get(User, target_user_id)
    if not target_user:
        return jsonify({"error": "Użytkownik nie znaleziony"}), 404

    if target_user.id == user.id:
        return jsonify({"error": "Nie możesz usunąć własnego konta"}), 400

    if target_user.role in ('admin', 'manager', 'super_admin') and admin_count() <= 1:
        return jsonify({"error": "Nie można usunąć ostatniego administratora"}), 400

    username = target_user.username
    db.session.execute(
        task_assignees.delete().where(task_assignees.c.user_id == target_user.id)
    )
    ActivityLog.query.filter_by(user_id=target_user.id).update({"user_id": None})
    SavedFilter.query.filter_by(user_id=target_user.id).delete()
    Tag.query.filter_by(user_id=target_user.id).delete()
    TaskTemplate.query.filter_by(user_id=target_user.id).delete()
    CustomField.query.filter_by(user_id=target_user.id).delete()
    db.session.delete(target_user)
    db.session.commit()

    return jsonify({"message": f"Usunięto użytkownika {username}"}), 200
