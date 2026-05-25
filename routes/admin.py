import re

from flask import g, jsonify, request
from sqlalchemy import func

from models import (
    ActivityLog,
    Comment,
    CustomField,
    Notification,
    Project,
    ProjectTemplate,
    SavedFilter,
    Subtask,
    Tag,
    Task,
    TaskDependency,
    TaskTemplate,
    Team,
    TeamAuditLog,
    TeamInvite,
    User,
    db,
    project_members,
    task_assignees,
)
from routes import admin_bp
from utils.auth_decorators import require_super_admin
from utils.errors import TeamNotEmptyError


def slugify(value):
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return slug or "team"


def unique_slug(name, team_id=None):
    base = slugify(name)
    candidate = base
    counter = 2
    while True:
        query = Team.query.filter_by(slug=candidate)
        if team_id is not None:
            query = query.filter(Team.id != team_id)
        if not query.first():
            return candidate
        candidate = f"{base}-{counter}"
        counter += 1


def team_name_exists(name, team_id=None):
    query = Team.query.filter(func.lower(Team.name) == name.strip().lower())
    if team_id is not None:
        query = query.filter(Team.id != team_id)
    return query.first() is not None


def add_audit(action, target_team_id=None, target_user_id=None, source_team_id=None, details=None):
    entry = TeamAuditLog(
        actor_id=g.current_user.id,
        action=action,
        target_team_id=target_team_id,
        target_user_id=target_user_id,
        source_team_id=source_team_id,
        details=details or {},
    )
    db.session.add(entry)
    return entry


def team_resource_counts(team_id):
    return {
        "members": User.query.filter_by(team_id=team_id).count(),
        "tasks": Task.query.filter_by(team_id=team_id).count(),
        "projects": Project.query.filter_by(team_id=team_id).count(),
        "comments": Comment.query.filter_by(team_id=team_id).count(),
        "subtasks": Subtask.query.filter_by(team_id=team_id).count(),
        "tags": Tag.query.filter_by(team_id=team_id).count(),
        "saved_filters": SavedFilter.query.filter_by(team_id=team_id).count(),
        "task_templates": TaskTemplate.query.filter_by(team_id=team_id).count(),
        "project_templates": ProjectTemplate.query.filter_by(team_id=team_id).count(),
        "notifications": Notification.query.filter_by(team_id=team_id).count(),
        "activity": ActivityLog.query.filter_by(team_id=team_id).count(),
        "custom_fields": CustomField.query.filter_by(team_id=team_id).count(),
        "dependencies": TaskDependency.query.filter_by(team_id=team_id).count(),
        "invites": TeamInvite.query.filter_by(team_id=team_id).count(),
    }


def serialize_team(team):
    data = team.to_dict(include_stats=True)
    data["stats"]["resources"] = team_resource_counts(team.id)
    return data


@admin_bp.route("/admin/teams", methods=["GET"])
@require_super_admin
def list_teams():
    teams = Team.query.order_by(Team.archived.asc(), Team.name.asc()).all()
    return jsonify({"teams": [serialize_team(team) for team in teams]})


@admin_bp.route("/admin/teams", methods=["POST"])
@require_super_admin
def create_team():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Nazwa zespołu jest wymagana"}), 400
    if team_name_exists(name):
        return jsonify({"error": "Zespół o tej nazwie już istnieje"}), 400

    team = Team(
        name=name,
        slug=unique_slug(name),
        description=(data.get("description") or "").strip(),
        created_by_id=g.current_user.id,
    )
    db.session.add(team)
    db.session.flush()
    add_audit("team.create", target_team_id=team.id, details={"name": team.name})
    db.session.commit()
    return jsonify({"team": serialize_team(team)}), 201


@admin_bp.route("/admin/teams/<int:team_id>", methods=["PUT"])
@require_super_admin
def update_team(team_id):
    team = db.session.get(Team, team_id)
    if not team:
        return jsonify({"error": "Zespół nie znaleziony"}), 404

    data = request.get_json() or {}
    changes = {}
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "Nazwa zespołu jest wymagana"}), 400
        if team_name_exists(name, team_id=team.id):
            return jsonify({"error": "Zespół o tej nazwie już istnieje"}), 400
        if name != team.name:
            changes["name"] = {"from": team.name, "to": name}
            team.name = name
            team.slug = unique_slug(name, team_id=team.id)
    if "description" in data:
        description = (data.get("description") or "").strip()
        if description != (team.description or ""):
            changes["description"] = {"from": team.description or "", "to": description}
            team.description = description

    add_audit("team.update", target_team_id=team.id, details=changes)
    db.session.commit()
    return jsonify({"team": serialize_team(team)})


@admin_bp.route("/admin/teams/<int:team_id>/archive", methods=["POST"])
@require_super_admin
def archive_team(team_id):
    team = db.session.get(Team, team_id)
    if not team:
        return jsonify({"error": "Zespół nie znaleziony"}), 404

    data = request.get_json() or {}
    archived = bool(data.get("archived", True))
    team.archived = archived
    User.query.filter_by(team_id=team.id).update({User.session_version: User.session_version + 1})
    add_audit(
        "team.archive" if archived else "team.unarchive",
        target_team_id=team.id,
        details={"archived": archived},
    )
    db.session.commit()
    return jsonify({"team": serialize_team(team)})


@admin_bp.route("/admin/teams/<int:team_id>", methods=["DELETE"])
@require_super_admin
def delete_team(team_id):
    team = db.session.get(Team, team_id)
    if not team:
        return jsonify({"error": "Zespół nie znaleziony"}), 404

    counts = team_resource_counts(team.id)
    if any(counts.values()):
        raise TeamNotEmptyError()

    add_audit("team.delete", target_team_id=team.id, details={"name": team.name})
    db.session.delete(team)
    db.session.commit()
    return "", 204


@admin_bp.route("/admin/teams/<int:team_id>/members", methods=["GET"])
@require_super_admin
def team_members(team_id):
    team = db.session.get(Team, team_id)
    if not team:
        return jsonify({"error": "Zespół nie znaleziony"}), 404
    users = User.query.filter_by(team_id=team.id).order_by(User.username.asc()).all()
    return jsonify({"team": team.to_dict(), "members": [user.to_dict() for user in users]})


@admin_bp.route("/admin/teams/<int:team_id>/audit", methods=["GET"])
@require_super_admin
def team_audit(team_id):
    team = db.session.get(Team, team_id)
    if not team:
        return jsonify({"error": "Zespół nie znaleziony"}), 404
    entries = (
        TeamAuditLog.query.filter(
            (TeamAuditLog.target_team_id == team.id) | (TeamAuditLog.source_team_id == team.id)
        )
        .order_by(TeamAuditLog.created_at.desc(), TeamAuditLog.id.desc())
        .all()
    )
    return jsonify({"audit": [entry.to_dict() for entry in entries]})


@admin_bp.route("/admin/audit", methods=["GET"])
@require_super_admin
def global_audit():
    entries = TeamAuditLog.query.order_by(TeamAuditLog.created_at.desc(), TeamAuditLog.id.desc()).all()
    return jsonify({"audit": [entry.to_dict() for entry in entries]})


@admin_bp.route("/admin/users/<int:user_id>/team", methods=["POST"])
@require_super_admin
def move_user_to_team(user_id):
    target_user = db.session.get(User, user_id)
    if not target_user:
        return jsonify({"error": "Użytkownik nie znaleziony"}), 404
    if target_user.role == "super_admin":
        return jsonify({"error": "Super admin nie może należeć do zespołu"}), 400

    data = request.get_json() or {}
    target_team_id = data.get("team_id")
    target_team = db.session.get(Team, target_team_id)
    if not target_team:
        return jsonify({"error": "Zespół nie znaleziony"}), 404
    if target_team.archived:
        return jsonify({"error": "Zespół jest zarchiwizowany", "code": "team_archived"}), 403

    source_team_id = target_user.team_id
    target_user.team_id = target_team.id
    target_user.session_version += 1

    SavedFilter.query.filter_by(user_id=target_user.id).update({"team_id": target_team.id})
    Notification.query.filter_by(user_id=target_user.id).update({"team_id": target_team.id})
    ActivityLog.query.filter_by(user_id=target_user.id).update({"team_id": target_team.id})
    Comment.query.filter_by(author=target_user.username).update({"team_id": target_team.id})

    db.session.execute(
        task_assignees.delete().where(
            task_assignees.c.user_id == target_user.id,
            task_assignees.c.task_id.in_(
                db.session.query(Task.id).filter(Task.team_id != target_team.id)
            ),
        )
    )
    db.session.execute(
        project_members.delete().where(
            project_members.c.user_id == target_user.id,
            project_members.c.project_id.in_(
                db.session.query(Project.id).filter(Project.team_id != target_team.id)
            ),
        )
    )

    add_audit(
        "user.move",
        target_team_id=target_team.id,
        target_user_id=target_user.id,
        source_team_id=source_team_id,
        details={"username": target_user.username},
    )
    db.session.commit()
    return jsonify({"user": target_user.to_dict(expand_team=True)})


@admin_bp.route("/admin/users/<int:user_id>/role", methods=["POST"])
@require_super_admin
def change_user_role(user_id):
    target_user = db.session.get(User, user_id)
    if not target_user:
        return jsonify({"error": "Użytkownik nie znaleziony"}), 404

    data = request.get_json() or {}
    new_role = data.get("role")
    if new_role not in {"super_admin", "manager", "user"}:
        return jsonify({"error": "Nieprawidłowa rola"}), 400

    if new_role == "super_admin":
        target_user.team_id = None
    elif target_user.team_id is None:
        team_id = data.get("team_id")
        team = db.session.get(Team, team_id)
        if not team:
            return jsonify({"error": "Zespół jest wymagany dla tej roli"}), 400
        if team.archived:
            return jsonify({"error": "Zespół jest zarchiwizowany", "code": "team_archived"}), 403
        target_user.team_id = team.id

    old_role = target_user.role
    target_user.role = new_role
    target_user.session_version += 1
    add_audit(
        "user.role_change",
        target_team_id=target_user.team_id,
        target_user_id=target_user.id,
        details={"username": target_user.username, "from": old_role, "to": new_role},
    )
    db.session.commit()
    return jsonify({"user": target_user.to_dict(expand_team=True)})
