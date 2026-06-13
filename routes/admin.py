import re

from flask import g, jsonify, request
from marshmallow import ValidationError
from sqlalchemy import func

from models import (
    ActivityLog,
    Comment,
    CustomField,
    Notification,
    Project,
    ProjectTemplate,
    RecurringTask,
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
    task_tags,
)
from routes import admin_bp
from schemas import AdminUserCreateSchema
from utils.auth_decorators import require_super_admin
from utils.delete_helpers import prepare_task_for_delete
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


from sqlalchemy.orm import selectinload

_RESOURCE_MODELS = [
    (Task, "tasks"),
    (Project, "projects"),
    (Comment, "comments"),
    (Subtask, "subtasks"),
    (Tag, "tags"),
    (SavedFilter, "saved_filters"),
    (TaskTemplate, "task_templates"),
    (ProjectTemplate, "project_templates"),
    (Notification, "notifications"),
    (ActivityLog, "activity"),
    (CustomField, "custom_fields"),
    (TaskDependency, "dependencies"),
    (TeamInvite, "invites"),
]


def _batch_team_resource_counts(team_ids):
    """Return {team_id: {resource_name: count}} for all teams in a constant
    number of queries (one per resource type) instead of 14 queries per team."""
    if not team_ids:
        return {}
    counts: dict[int, dict[str, int]] = {tid: {} for tid in team_ids}

    for model, key in _RESOURCE_MODELS:
        rows = (
            db.session.query(model.team_id, func.count(model.id))
            .filter(model.team_id.in_(team_ids))
            .group_by(model.team_id)
            .all()
        )
        for tid, cnt in rows:
            counts[tid][key] = cnt
        for tid in team_ids:
            counts[tid].setdefault(key, 0)

    # Members (from User, not a team-FK resource)
    rows = (
        db.session.query(User.team_id, func.count(User.id))
        .filter(User.team_id.in_(team_ids))
        .group_by(User.team_id)
        .all()
    )
    for tid, cnt in rows:
        counts[tid]["members"] = cnt
    for tid in team_ids:
        counts[tid].setdefault("members", 0)

    return counts


def serialize_team(team, batch_counts=None):
    data = team.to_dict(include_stats=True)
    if batch_counts is not None:
        data["stats"]["resources"] = batch_counts.get(team.id, {})
    else:
        # Fallback for callers that don't supply batch data
        data["stats"]["resources"] = _batch_team_resource_counts([team.id]).get(team.id, {})
    return data


@admin_bp.route("/admin/teams", methods=["GET"])
@require_super_admin
def list_teams():
    teams = Team.query.options(selectinload(Team.members)).order_by(Team.archived.asc(), Team.name.asc()).all()
    team_ids = [team.id for team in teams]
    batch_counts = _batch_team_resource_counts(team_ids)
    return jsonify({"teams": [serialize_team(team, batch_counts) for team in teams]})


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


def _purge_user_data(user):
    """Remove all data owned by a user before deleting the user row.

    Mirrors routes.users.delete_user but works for super_admin (no team scope)
    and is shared between user-delete and team cascade-delete.
    """
    owned_tasks = Task.query.filter_by(user_id=user.id).all()
    for task in owned_tasks:
        prepare_task_for_delete(task)
        db.session.delete(task)

    db.session.execute(
        task_assignees.delete().where(task_assignees.c.user_id == user.id)
    )
    db.session.execute(
        project_members.delete().where(project_members.c.user_id == user.id)
    )
    ActivityLog.query.filter_by(user_id=user.id).update({"user_id": None})
    SavedFilter.query.filter_by(user_id=user.id).delete()
    Tag.query.filter_by(user_id=user.id).delete()
    TaskTemplate.query.filter_by(user_id=user.id).delete()
    CustomField.query.filter_by(user_id=user.id).delete()

    # Detach FK references so the user row can be deleted without
    # triggering IntegrityError on the referenced tables.
    Project.query.filter_by(created_by_id=user.id).update({"created_by_id": None})
    ProjectTemplate.query.filter_by(created_by_id=user.id).update({"created_by_id": None})
    TeamInvite.query.filter_by(created_by_id=user.id).update({"created_by_id": None})
    TeamInvite.query.filter_by(consumed_by_id=user.id).update({"consumed_by_id": None})
    TeamAuditLog.query.filter_by(target_user_id=user.id).update({"target_user_id": None})
    TeamAuditLog.query.filter_by(actor_id=user.id).update({"actor_id": None})
    Notification.query.filter_by(user_id=user.id).delete()

def _cascade_purge_team(team):
    """Hard-delete every resource bound to a team prior to deleting the team itself.

    Order matters because of FK constraints: child rows go before their parents.
    """
    user_ids = [user.id for user in User.query.filter_by(team_id=team.id).all()]
    task_ids = [task.id for task in Task.query.filter_by(team_id=team.id).all()]
    tag_ids = [tag.id for tag in Tag.query.filter_by(team_id=team.id).all()]

    # Detach m2m rows tied to team users so user deletes don't trip on FK.
    if user_ids:
        db.session.execute(
            task_assignees.delete().where(task_assignees.c.user_id.in_(user_ids))
        )
        db.session.execute(
            project_members.delete().where(project_members.c.user_id.in_(user_ids))
        )
    if task_ids:
        db.session.execute(
            task_assignees.delete().where(task_assignees.c.task_id.in_(task_ids))
        )
        db.session.execute(
            task_tags.delete().where(task_tags.c.task_id.in_(task_ids))
        )
    if tag_ids:
        db.session.execute(
            task_tags.delete().where(task_tags.c.tag_id.in_(tag_ids))
        )

    Notification.query.filter_by(team_id=team.id).delete(synchronize_session=False)
    ActivityLog.query.filter_by(team_id=team.id).delete(synchronize_session=False)
    CustomField.query.filter_by(team_id=team.id).delete(synchronize_session=False)
    RecurringTask.query.filter_by(team_id=team.id).delete(synchronize_session=False)
    TaskDependency.query.filter_by(team_id=team.id).delete(synchronize_session=False)
    Comment.query.filter_by(team_id=team.id).delete(synchronize_session=False)
    Subtask.query.filter_by(team_id=team.id).delete(synchronize_session=False)
    SavedFilter.query.filter_by(team_id=team.id).delete(synchronize_session=False)
    TaskTemplate.query.filter_by(team_id=team.id).delete(synchronize_session=False)
    Tag.query.filter_by(team_id=team.id).delete(synchronize_session=False)

    # Tasks have cascade='all, delete-orphan' for comments/subtasks/dependencies via ORM,
    # but we already wiped those above; this just removes the parent rows safely.
    Task.query.filter_by(team_id=team.id).delete(synchronize_session=False)
    Project.query.filter_by(team_id=team.id).delete(synchronize_session=False)
    ProjectTemplate.query.filter_by(team_id=team.id).delete(synchronize_session=False)
    TeamInvite.query.filter_by(team_id=team.id).delete(synchronize_session=False)

    if user_ids:
        # Clean per-user side data that does not carry team_id.
        ActivityLog.query.filter(ActivityLog.user_id.in_(user_ids)).update(
            {"user_id": None}, synchronize_session=False
        )
        Notification.query.filter(Notification.user_id.in_(user_ids)).delete(synchronize_session=False)
        SavedFilter.query.filter(SavedFilter.user_id.in_(user_ids)).delete(synchronize_session=False)
        Tag.query.filter(Tag.user_id.in_(user_ids)).delete(synchronize_session=False)
        TaskTemplate.query.filter(TaskTemplate.user_id.in_(user_ids)).delete(synchronize_session=False)
        CustomField.query.filter(CustomField.user_id.in_(user_ids)).delete(synchronize_session=False)
        # Tasks owned by these users (in any team) — should be none after the team-scoped delete,
        # but cover the edge case.
        Task.query.filter(Task.user_id.in_(user_ids)).delete(synchronize_session=False)
        # Detach project ownership references so the user row can go.
        Project.query.filter(Project.created_by_id.in_(user_ids)).update(
            {"created_by_id": None}, synchronize_session=False
        )
        ProjectTemplate.query.filter(ProjectTemplate.created_by_id.in_(user_ids)).update(
            {"created_by_id": None}, synchronize_session=False
        )
        TeamInvite.query.filter(TeamInvite.created_by_id.in_(user_ids)).update(
            {"created_by_id": None}, synchronize_session=False
        )
        TeamInvite.query.filter(TeamInvite.consumed_by_id.in_(user_ids)).update(
            {"consumed_by_id": None}, synchronize_session=False
        )
        # Audit log entries referencing these users must have target_user_id
        # nullified before the user rows are deleted.
        TeamAuditLog.query.filter(TeamAuditLog.target_user_id.in_(user_ids)).update(
            {"target_user_id": None}, synchronize_session=False
        )
        TeamAuditLog.query.filter(TeamAuditLog.actor_id.in_(user_ids)).update(
            {"actor_id": None}, synchronize_session=False
        )

        User.query.filter(User.id.in_(user_ids)).delete(synchronize_session=False)


@admin_bp.route("/admin/teams/<int:team_id>", methods=["DELETE"])
@require_super_admin
def delete_team(team_id):
    team = db.session.get(Team, team_id)
    if not team:
        return jsonify({"error": "Zespół nie znaleziony"}), 404

    cascade = request.args.get("cascade", "").lower() in {"1", "true", "yes"}
    counts = _batch_team_resource_counts([team.id]).get(team.id, {})

    if any(counts.values()) and not cascade:
        raise TeamNotEmptyError()

    if cascade:
        _cascade_purge_team(team)

    TeamAuditLog.query.filter_by(target_team_id=team.id).update({"target_team_id": None})
    TeamAuditLog.query.filter_by(source_team_id=team.id).update({"source_team_id": None})
    add_audit(
        "team.delete",
        details={"team_id": team.id, "name": team.name, "cascade": cascade, "removed": counts if cascade else {}},
    )
    db.session.delete(team)
    db.session.commit()
    return "", 204


@admin_bp.route("/admin/users/<int:user_id>", methods=["DELETE"])
@require_super_admin
def delete_user(user_id):
    target = db.session.get(User, user_id)
    if not target:
        return jsonify({"error": "Użytkownik nie znaleziony"}), 404
    if target.id == g.current_user.id:
        return jsonify({"error": "Nie możesz usunąć własnego konta"}), 400
    if target.role == "super_admin":
        active_admins = User.query.filter_by(role="super_admin").count()
        if active_admins <= 1:
            return jsonify({"error": "Nie można usunąć ostatniego super admina"}), 400

    username = target.username
    source_team_id = target.team_id

    _purge_user_data(target)

    add_audit(
        "user.delete",
        target_team_id=source_team_id,
        target_user_id=None,
        details={"username": username, "role": target.role, "deleted_user_id": user_id},
    )

    db.session.delete(target)
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


@admin_bp.route("/admin/teams/<int:team_id>/members", methods=["POST"])
@require_super_admin
def create_team_member(team_id):
    team = db.session.get(Team, team_id)
    if not team:
        return jsonify({"error": "Zespół nie znaleziony"}), 404
    if team.archived:
        return jsonify({"error": "Zespół jest zarchiwizowany", "code": "team_archived"}), 403

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

    role = "manager" if validated["role"] == "admin" else validated["role"]
    if role == "super_admin":
        return jsonify({"error": "Super admin nie może być przypisany do zespołu"}), 400

    new_user = User(
        username=username,
        email=email,
        role=role,
        team_id=team.id,
    )
    new_user.set_password(validated["password"])
    db.session.add(new_user)
    db.session.flush()

    add_audit(
        "user.create",
        target_team_id=team.id,
        target_user_id=new_user.id,
        details={"username": new_user.username, "role": new_user.role},
    )
    db.session.commit()

    return jsonify({"user": new_user.to_dict(expand_team=True)}), 201


@admin_bp.route("/admin/teams/<int:team_id>/audit", methods=["GET"])
@require_super_admin
def team_audit(team_id):
    team = db.session.get(Team, team_id)
    if not team:
        return jsonify({"error": "Zespół nie znaleziony"}), 404

    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    per_page = min(per_page, 200)

    pagination = (
        TeamAuditLog.query.filter(
            (TeamAuditLog.target_team_id == team.id) | (TeamAuditLog.source_team_id == team.id)
        )
        .order_by(TeamAuditLog.created_at.desc(), TeamAuditLog.id.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )
    return jsonify({
        "audit": [entry.to_dict() for entry in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
        "pages": pagination.pages,
        "per_page": pagination.per_page,
    })


@admin_bp.route("/admin/audit", methods=["GET"])
@require_super_admin
def global_audit():
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    per_page = min(per_page, 200)

    pagination = (
        TeamAuditLog.query
        .order_by(TeamAuditLog.created_at.desc(), TeamAuditLog.id.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )
    return jsonify({
        "audit": [entry.to_dict() for entry in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
        "pages": pagination.pages,
        "per_page": pagination.per_page,
    })


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
    if old_role == "super_admin" and new_role != "super_admin":
        remaining = User.query.filter(User.role == "super_admin", User.id != target_user.id).count()
        if remaining == 0:
            return jsonify({"error": "Nie można usunąć ostatniego super_admina"}), 400

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
