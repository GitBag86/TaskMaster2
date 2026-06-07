from datetime import date, datetime, timezone

from flask import g, jsonify, request, session
from marshmallow import ValidationError
from sqlalchemy.orm import selectinload

from extensions import socketio
from models import ActivityLog, Project, Task, TaskDependency, User, db
from routes import projects_bp
from routes.auth import login_required
from routes.tasks import (
    normalize_project_name,
    send_project_activity_emails,
    send_project_completed_emails,
    update_project_members,
    user_can_access_task,
    task_is_done,
    task_open_dependencies,
    task_open_subtasks,
)
from schemas import ProjectSchema
from utils.realtime import emit_team_event
from utils.errors import CrossTeamReferenceError
from utils.scoping import get_team_resource_or_404, team_scoped


def visible_projects_for_user(user):
    if g.get('current_role') in ('manager', 'super_admin'):
        return team_scoped(Project.query, Project).order_by(Project.archived.asc(), Project.name.asc()).all()

    from routes.tasks import assigned_task_query
    project_ids = {
        task.project_id
        for task in assigned_task_query(user).all()
        if task.project_id is not None
    }
    member_project_ids = {
        project.id
        for project in team_scoped(Project.query, Project).filter(Project.members.any(User.id == user.id)).all()
    }
    project_ids.update(member_project_ids)
    if not project_ids:
        return []
    return team_scoped(Project.query, Project).filter(Project.id.in_(project_ids)).order_by(Project.name.asc()).all()


def project_completion_status(project):
    open_tasks = [task for task in project.tasks if not task_is_done(task)]
    blocked_tasks = [task for task in open_tasks if task_open_dependencies(task)]
    today = date.today()
    overdue_tasks = [
        task
        for task in open_tasks
        if task.due_date is not None and task.due_date < today
    ]

    checks = {
        "all_tasks_done": len(open_tasks) == 0,
        "no_blocked_tasks": len(blocked_tasks) == 0,
        "no_overdue_tasks": len(overdue_tasks) == 0,
    }

    return {
        "ready": all(checks.values()),
        "checks": checks,
        "open_tasks": [task.summary_dict() for task in open_tasks],
        "blocked_tasks": [task.summary_dict() for task in blocked_tasks],
        "overdue_tasks": [task.summary_dict() for task in overdue_tasks],
    }


def user_can_access_project(user, project):
    if g.get('current_role') in ('manager', 'super_admin'):
        return True
    if user in project.members:
        return True
    return any(user_can_access_task(user, task) for task in project.tasks)


@projects_bp.route('/projects', methods=['GET'])
@login_required
def get_projects():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    projects = []

    for project in visible_projects_for_user(user):
        project_data = project.to_dict(include_tasks=False)
        if g.get('current_role') in ('manager', 'super_admin'):
            project_tasks = project.tasks
        else:
            project_tasks = [task for task in project.tasks if user_can_access_task(user, task)]
        project_data['tasks'] = [task.to_dict() for task in project_tasks]
        projects.append(project_data)

    return jsonify({'projects': projects})


@projects_bp.route('/projects', methods=['POST'])
@login_required
def create_project():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if g.get('current_role') not in ('manager', 'super_admin'):
        return jsonify({"error": "Tylko administrator może tworzyć projekty"}), 403

    schema = ProjectSchema()
    try:
        validated = schema.load(request.get_json() or {})
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    name = normalize_project_name(validated.get('name'))
    if team_scoped(Project.query, Project).filter_by(name=name).first():
        return jsonify({"error": "Projekt o tej nazwie już istnieje"}), 409

    project = Project(
        name=name,
        description=validated.get('description') or '',
        color=validated.get('color') or '#3b82f6',
        archived=validated.get('archived', False),
        created_by_id=user_id,
        team_id=g.get('current_team_id'),
    )
    update_project_members(project, validated.get('member_ids', []))
    db.session.add(project)
    db.session.commit()
    emit_team_event({
        "action": "project_created",
        "user": user.username,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "project": project.to_dict(include_tasks=False),
    })
    return jsonify(project.to_dict(include_tasks=False)), 201


@projects_bp.route('/projects/<int:project_id>', methods=['PUT'])
@login_required
def update_project(project_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if g.get('current_role') not in ('manager', 'super_admin'):
        return jsonify({"error": "Tylko administrator może edytować projekty"}), 403

    project = get_team_resource_or_404(Project, project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404

    schema = ProjectSchema(partial=True)
    try:
        validated = schema.load(request.get_json() or {})
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    old_name = project.name
    if 'name' in validated:
        name = normalize_project_name(validated.get('name'))
        duplicate = team_scoped(Project.query, Project).filter(Project.name == name, Project.id != project.id).first()
        if duplicate:
            return jsonify({"error": "Projekt o tej nazwie już istnieje"}), 409
        project.name = name
    if 'description' in validated:
        project.description = validated.get('description') or ''
    if 'color' in validated:
        project.color = validated.get('color') or '#3b82f6'
    if 'archived' in validated:
        project.archived = validated.get('archived', False)
    if 'member_ids' in validated:
        update_project_members(project, validated.get('member_ids', []))

    if project.name != old_name:
        for task in project.tasks:
            task.project = project.name

    db.session.commit()
    send_project_activity_emails(project, user, "Zaktualizowano ustawienia projektu")
    emit_team_event({
        "action": "project_updated",
        "user": user.username,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "project": project.to_dict(include_tasks=False),
    })
    return jsonify(project.to_dict(include_tasks=True))


@projects_bp.route('/projects/<int:project_id>/completion', methods=['GET'])
@login_required
def get_project_completion(project_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    project = get_team_resource_or_404(Project, project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404
    if not user_can_access_project(user, project):
        return jsonify({"error": "Permission denied"}), 403

    return jsonify(project_completion_status(project))


@projects_bp.route('/projects/<int:project_id>/complete', methods=['POST'])
@login_required
def complete_project(project_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if g.get('current_role') not in ('manager', 'super_admin'):
        return jsonify({"error": "Tylko administrator może kończyć projekty"}), 403

    project = get_team_resource_or_404(Project, project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404

    completion = project_completion_status(project)
    if not completion["ready"]:
        return jsonify({
            "error": "Nie można zakończyć projektu, który nie spełnia checklisty gotowości.",
            "completion": completion,
        }), 409

    project.archived = True
    db.session.commit()
    send_project_completed_emails(project, user)
    emit_team_event({
        "action": "project_completed",
        "user": user.username,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "project": project.to_dict(include_tasks=False),
    })

    data = project.to_dict(include_tasks=True)
    data["completion"] = completion
    return jsonify(data)


@projects_bp.route('/projects/<int:project_id>', methods=['DELETE'])
@login_required
def archive_project(project_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if g.get('current_role') not in ('manager', 'super_admin'):
        return jsonify({"error": "Tylko administrator może archiwizować projekty"}), 403

    project = get_team_resource_or_404(Project, project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404

    completion = project_completion_status(project)
    if not completion["ready"]:
        return jsonify({
            "error": "Nie można archiwizować projektu, który nie spełnia checklisty gotowości.",
            "completion": completion,
        }), 409

    project.archived = True
    db.session.commit()
    send_project_completed_emails(project, user)
    emit_team_event({
        "action": "project_archived",
        "user": user.username,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "project": project.to_dict(include_tasks=False),
    })
    return jsonify(project.to_dict(include_tasks=False))
