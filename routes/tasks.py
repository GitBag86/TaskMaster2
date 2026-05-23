import re

from flask import request, jsonify, session, url_for
from datetime import date, datetime, timedelta, timezone
from marshmallow import ValidationError
from extensions import socketio
from routes import tasks_bp
from models import db, User, Task, Comment, Subtask, ActivityLog, Tag, Project, TaskDependency
from schemas import TaskSchema, CommentSchema, SubtaskSchema, ProjectSchema, DependencySchema
from routes.auth import login_required
from utils.email_sender import (
    send_email,
    get_project_activity_body,
    get_project_completed_body,
    get_task_status_change_body,
    get_task_assignment_body,
    get_task_completion_body,
)
from utils.notifications import create_notification, emit_notifications

TASK_ALLOWED_FIELDS = {'title', 'priority', 'project', 'project_id', 'due_date', 'notes', 'completed', 'status'}
BULK_MAX_TASKS = 100

PROJECT_TEMPLATES = {
    "client_onboarding": {
        "name": "Wdrożenie klienta",
        "description": "Standardowy proces startu współpracy z klientem.",
        "color": "#14b8a6",
        "tasks": [
            {"title": "Zebrać wymagania", "priority": "high", "due_offset": 1},
            {"title": "Przygotować plan wdrożenia", "priority": "high", "due_offset": 3, "depends_on": [0]},
            {"title": "Skonfigurować środowisko", "priority": "medium", "due_offset": 5, "depends_on": [1]},
            {"title": "Przeprowadzić szkolenie", "priority": "medium", "due_offset": 7, "depends_on": [2]},
            {"title": "Zamknąć odbiór", "priority": "high", "due_offset": 10, "depends_on": [3]},
        ],
    },
    "release": {
        "name": "Release",
        "description": "Kontrolna lista wydania wersji produkcyjnej.",
        "color": "#6366f1",
        "tasks": [
            {"title": "Zamrozić zakres release'u", "priority": "high", "due_offset": 1},
            {"title": "Przejść testy regresji", "priority": "high", "due_offset": 2, "depends_on": [0]},
            {"title": "Przygotować notatki wydania", "priority": "medium", "due_offset": 2, "depends_on": [0]},
            {"title": "Wdrożyć na produkcję", "priority": "high", "due_offset": 3, "depends_on": [1, 2]},
            {"title": "Monitorować po wdrożeniu", "priority": "medium", "due_offset": 4, "depends_on": [3]},
        ],
    },
    "campaign": {
        "name": "Kampania",
        "description": "Plan przygotowania i uruchomienia kampanii.",
        "color": "#f59e0b",
        "tasks": [
            {"title": "Ustalić cel kampanii", "priority": "high", "due_offset": 1},
            {"title": "Przygotować treści", "priority": "medium", "due_offset": 3, "depends_on": [0]},
            {"title": "Skonfigurować kanały", "priority": "medium", "due_offset": 4, "depends_on": [0]},
            {"title": "Uruchomić kampanię", "priority": "high", "due_offset": 5, "depends_on": [1, 2]},
            {"title": "Podsumować wyniki", "priority": "medium", "due_offset": 12, "depends_on": [3]},
        ],
    },
}

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
    socketio.emit("task_action", payload)

def app_url(path=''):
    return url_for('index', _external=True) + path.lstrip('/')

def task_url(task):
    return app_url(f'tasks/{task.id}')

def project_url(project):
    return app_url('projects')

def unique_email_users(users, actor=None, exclude_user_ids=None):
    excluded = set(exclude_user_ids or [])
    if actor:
        excluded.add(actor.id)

    recipients = {}
    for candidate in users:
        if not candidate or not candidate.email or candidate.id in excluded:
            continue
        recipients[candidate.id] = candidate
    return list(recipients.values())

def task_email_users(task, actor=None, exclude_user_ids=None):
    return unique_email_users([task.owner, *task.assignees], actor=actor, exclude_user_ids=exclude_user_ids)

def project_email_users(project, actor=None, exclude_user_ids=None):
    users = []
    if project.created_by_id:
        users.append(db.session.get(User, project.created_by_id))
    users.extend(project.members)
    for task in project.tasks:
        users.append(task.owner)
        users.extend(task.assignees)
    return unique_email_users(users, actor=actor, exclude_user_ids=exclude_user_ids)

def send_task_completion_emails(task, actor):
    link = task_url(task)
    action_label = "zakończone" if task.completed else "przywrócone"
    for recipient in task_email_users(task, actor=actor):
        send_email(
            recipient.email,
            f"Zadanie {action_label}: {task.title}",
            get_task_completion_body(task.title, recipient.username, actor.username, task.completed, link),
        )

def send_project_activity_emails(project, actor, activity, task=None, exclude_user_ids=None, extra_users=None):
    if not project:
        return

    link = project_url(project)
    recipients = [
        *project_email_users(project),
        *(extra_users or []),
    ]
    for recipient in unique_email_users(recipients, actor=actor, exclude_user_ids=exclude_user_ids):
        send_email(
            recipient.email,
            f"Zmiana w projekcie: {project.name}",
            get_project_activity_body(
                project.name,
                recipient.username,
                actor.username,
                activity,
                link,
                task.title if task else None,
            ),
        )

def send_project_completed_emails(project, actor):
    link = project_url(project)
    for recipient in project_email_users(project, actor=actor):
        send_email(
            recipient.email,
            f"Projekt zakończony: {project.name}",
            get_project_completed_body(project.name, recipient.username, actor.username, link),
        )

def parse_due_date(value):
    if not value:
        return None
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).date()
        except ValueError:
            pass
    return value

def user_can_access_task(user, task):
    return user.role == 'admin' or user in task.assignees

def task_is_done(task):
    return task.completed or task.status == 'done'

def task_open_dependencies(task):
    return [
        dependency.depends_on_task
        for dependency in task.dependencies
        if dependency.depends_on_task and not task_is_done(dependency.depends_on_task)
    ]

def task_open_subtasks(task):
    return [subtask for subtask in task.subtasks if not subtask.completed]

def blocked_completion_response(task):
    open_dependencies = task_open_dependencies(task)
    open_subtasks = task_open_subtasks(task)
    return jsonify({
        "error": "Nie można zakończyć zadania, dopóki ma otwarte zależności lub podzadania.",
        "blocked_by": [dependency_task.summary_dict() for dependency_task in open_dependencies],
        "open_subtasks": [subtask.to_dict() for subtask in open_subtasks],
    }), 409

def task_blocks_completion(task):
    return bool(task_open_dependencies(task) or task_open_subtasks(task))

def would_create_dependency_cycle(task_id, depends_on_task_id):
    pending = [depends_on_task_id]
    visited = set()

    while pending:
        current_id = pending.pop()
        if current_id == task_id:
            return True
        if current_id in visited:
            continue
        visited.add(current_id)
        pending.extend(
            dependency.depends_on_task_id
            for dependency in TaskDependency.query.filter_by(task_id=current_id).all()
        )

    return False

def assigned_task_query(user):
    return Task.query.filter(Task.assignees.any(User.id == user.id))

def visible_task_query(user):
    if user.role == 'admin':
        return Task.query
    return assigned_task_query(user)

def assignee_names(task):
    return ', '.join(user.username for user in task.assignees)

def update_task_assignees(task, assignee_ids):
    assignee_ids = (assignee_ids or [])[:1]
    users = User.query.filter(User.id.in_(assignee_ids)).all() if assignee_ids else []
    task.assignees = users
    return users

def update_project_members(project, member_ids):
    users = User.query.filter(User.id.in_(member_ids or [])).all() if member_ids else []
    project.members = users
    return users

def normalize_project_name(name):
    return (name or 'Ogólny').strip() or 'Ogólny'

def get_or_create_project(name, user, color='#3b82f6', description=''):
    project_name = normalize_project_name(name)
    project = Project.query.filter_by(name=project_name).first()
    if project:
        return project
    project = Project(
        name=project_name,
        description=description or '',
        color=color or '#3b82f6',
        created_by_id=user.id if user else None,
    )
    db.session.add(project)
    db.session.flush()
    return project

def resolve_project(project_id, project_name, user):
    if project_id:
        project = db.session.get(Project, project_id)
        if not project:
            return None, ("Project not found", 404)
        return project, None
    return get_or_create_project(project_name, user), None

def set_task_project(task, project):
    task.project_id = project.id
    task.project = project.name

def visible_projects_for_user(user):
    if user.role == 'admin':
        return Project.query.order_by(Project.archived.asc(), Project.name.asc()).all()

    project_ids = {
        task.project_id
        for task in assigned_task_query(user).all()
        if task.project_id is not None
    }
    member_project_ids = {
        project.id
        for project in Project.query.filter(Project.members.any(User.id == user.id)).all()
    }
    project_ids.update(member_project_ids)
    if not project_ids:
        return []
    return Project.query.filter(Project.id.in_(project_ids)).order_by(Project.name.asc()).all()

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
    if user.role == 'admin':
        return True
    if user in project.members:
        return True
    return any(user_can_access_task(user, task) for task in project.tasks)

def extract_mentions(text):
    return sorted(set(re.findall(r'@([A-Za-z0-9_.-]{3,100})', text or '')))

def parse_quick_task(text):
    tokens = text.split()
    title_tokens = []
    assignee_names = []
    project_name = None
    priority = 'medium'
    due_date = None
    today = date.today()
    priority_aliases = {
        'high': 'high',
        'wysoki': 'high',
        'medium': 'medium',
        'sredni': 'medium',
        'średni': 'medium',
        'low': 'low',
        'niski': 'low',
    }

    for token in tokens:
        lowered = token.lower().strip()
        if token.startswith('@') and len(token) > 1:
            assignee_names.append(token[1:])
        elif token.startswith('#') and len(token) > 1:
            project_name = token[1:].replace('_', ' ')
        elif lowered.startswith('!') and lowered[1:] in priority_aliases:
            priority = priority_aliases[lowered[1:]]
        elif lowered in ('dzis', 'dziś', 'today'):
            due_date = today
        elif lowered in ('jutro', 'tomorrow'):
            due_date = today + timedelta(days=1)
        elif re.fullmatch(r'\d{4}-\d{2}-\d{2}', lowered):
            due_date = parse_due_date(lowered)
        else:
            title_tokens.append(token)

    title = ' '.join(title_tokens).strip()
    return {
        "title": title,
        "assignee_names": assignee_names,
        "priority": priority,
        "project": project_name or 'Ogólny',
        "due_date": due_date,
    }

def create_task_record(user, title, priority='medium', project_name='Ogólny', due_date=None, notes='', assignee_ids=None):
    project, project_error = resolve_project(None, project_name, user)
    if project_error:
        return None, project_error

    task = Task(
        user_id=user.id,
        title=title,
        priority=priority,
        project=project.name,
        project_id=project.id,
        due_date=due_date,
        notes=notes or '',
    )
    assignees = update_task_assignees(task, assignee_ids or [])
    db.session.add(task)
    db.session.flush()
    return task, assignees

def create_assignment_notifications(task, actor, assignees):
    notifications = []
    for assignee in assignees:
        if assignee.id == actor.id:
            continue
        notifications.append(create_notification(
            user_id=assignee.id,
            notification_type='assignment',
            message=f"Przypisano Cię do zadania: {task.title}",
            task=task,
            actor=actor,
        ))
    return notifications

def create_unblocked_notifications(blocker_task, actor):
    notifications = []
    for dependent_task in blocker_task.open_dependent_tasks():
        if task_open_dependencies(dependent_task):
            continue
        for assignee in dependent_task.assignees:
            if assignee.id == actor.id:
                continue
            notifications.append(create_notification(
                user_id=assignee.id,
                notification_type='unblocked',
                message=f"Odblokowano zadanie: {dependent_task.title}",
                task=dependent_task,
                actor=actor,
            ))
    return notifications

@tasks_bp.route('/tasks', methods=['GET'])
@login_required
def get_tasks():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    per_page = min(per_page, 100)

    query = visible_task_query(user)

    pagination = query.order_by(Task.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)
    tasks = pagination.items

    return jsonify({
        "tasks": [t.to_dict() for t in tasks],
        "total": pagination.total,
        "page": pagination.page,
        "pages": pagination.pages,
        "per_page": pagination.per_page,
        "has_next": pagination.has_next,
        "has_prev": pagination.has_prev,
    })

@tasks_bp.route('/tasks/today', methods=['GET'])
@login_required
def get_today_tasks():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    today = date.today()
    week_end = today + timedelta(days=7)

    tasks = (
        visible_task_query(user)
        .filter(Task.completed.is_(False), Task.due_date.isnot(None), Task.due_date <= week_end)
        .order_by(Task.due_date.asc(), Task.priority.asc(), Task.created_at.desc())
        .all()
    )

    overdue = []
    due_today = []
    upcoming = []
    for task in tasks:
        if task.due_date < today:
            overdue.append(task.to_dict())
        elif task.due_date == today:
            due_today.append(task.to_dict())
        else:
            upcoming.append(task.to_dict())

    blocked = [task for task in tasks if task_open_dependencies(task)]
    ready = [task for task in tasks if not task_open_dependencies(task)]
    high_priority = [task for task in tasks if task.priority == 'high']

    return jsonify({
        "overdue": overdue,
        "today": due_today,
        "upcoming": upcoming,
        "counts": {
            "overdue": len(overdue),
            "today": len(due_today),
            "upcoming": len(upcoming),
            "total": len(tasks),
            "blocked": len(blocked),
            "ready": len(ready),
            "high_priority": len(high_priority),
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    })

@tasks_bp.route('/tasks/blocked', methods=['GET'])
@login_required
def get_blocked_tasks():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    tasks = visible_task_query(user).order_by(Task.created_at.desc()).all()
    blocked_tasks = [task for task in tasks if not task_is_done(task) and task_open_dependencies(task)]

    return jsonify({
        "tasks": [task.to_dict() for task in blocked_tasks],
        "total": len(blocked_tasks),
    })

@tasks_bp.route('/tasks/dependency-board', methods=['GET'])
@login_required
def get_dependency_board():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    tasks = visible_task_query(user).all()
    priority_rank = {'high': 0, 'medium': 1, 'low': 2}

    def due_sort_value(task):
        return task.due_date or date.max

    open_tasks = [task for task in tasks if not task_is_done(task)]
    blocked_tasks = [task for task in open_tasks if task_open_dependencies(task)]
    ready_tasks = [
        task for task in open_tasks
        if not task_open_dependencies(task)
    ]
    blocker_tasks = [
        task for task in open_tasks
        if task.open_dependent_tasks()
    ]

    blocked_tasks.sort(key=lambda task: (due_sort_value(task), priority_rank.get(task.priority, 9), task.created_at))
    ready_tasks.sort(key=lambda task: (due_sort_value(task), priority_rank.get(task.priority, 9), task.created_at))
    blocker_tasks.sort(key=lambda task: (-len(task.open_dependent_tasks()), due_sort_value(task), task.title.lower()))

    blockers = []
    for task in blocker_tasks[:10]:
        blocked_dependents = [dependent.summary_dict() for dependent in task.open_dependent_tasks()]
        summary = task.summary_dict()
        summary["blocking_count"] = len(blocked_dependents)
        summary["blocking_tasks"] = blocked_dependents[:5]
        blockers.append(summary)

    return jsonify({
        "blocked": [task.to_dict() for task in blocked_tasks[:10]],
        "blockers": blockers,
        "ready": [task.to_dict() for task in ready_tasks[:10]],
        "counts": {
            "blocked": len(blocked_tasks),
            "blockers": len(blocker_tasks),
            "ready": len(ready_tasks),
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    })

@tasks_bp.route('/tasks/<int:task_id>/dependencies', methods=['GET', 'POST'])
@login_required
def manage_task_dependencies(task_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    task = db.session.get(Task, task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    if not user_can_access_task(user, task):
        return jsonify({"error": "Permission denied"}), 403

    if request.method == 'GET':
        return jsonify({
            "dependencies": [dependency.to_dict() for dependency in task.dependencies],
            "blocked_by": [dependency_task.summary_dict() for dependency_task in task_open_dependencies(task)],
        })

    if user.role != 'admin':
        return jsonify({"error": "Tylko administrator może zarządzać zależnościami"}), 403

    schema = DependencySchema()
    try:
        validated = schema.load(request.get_json() or {})
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    depends_on_task_id = validated['depends_on_task_id']
    depends_on_task = db.session.get(Task, depends_on_task_id)
    if not depends_on_task:
        return jsonify({"error": "Dependency task not found"}), 404
    if depends_on_task.id == task.id:
        return jsonify({"error": "Zadanie nie może zależeć od samego siebie"}), 400
    if TaskDependency.query.filter_by(task_id=task.id, depends_on_task_id=depends_on_task.id).first():
        return jsonify({"error": "Ta zależność już istnieje"}), 409
    if would_create_dependency_cycle(task.id, depends_on_task.id):
        return jsonify({"error": "Ta zależność utworzyłaby cykl"}), 409

    dependency = TaskDependency(task_id=task.id, depends_on_task_id=depends_on_task.id)
    db.session.add(dependency)
    db.session.add(ActivityLog(
        user_id=user_id,
        task_id=task.id,
        action='dependency_added',
        details={'depends_on_task_id': depends_on_task.id, 'title': depends_on_task.title},
    ))
    db.session.commit()
    db.session.refresh(task)

    emit_task_event("dependency_added", user, task=task)
    return jsonify(task.to_dict()), 201

@tasks_bp.route('/dependencies/<int:dep_id>', methods=['DELETE'])
@login_required
def delete_dependency(dep_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    dependency = db.session.get(TaskDependency, dep_id)
    if not dependency:
        return jsonify({"error": "Not found"}), 404

    task = dependency.task
    if not task or not user_can_access_task(user, task):
        return jsonify({"error": "Permission denied"}), 403
    if user.role != 'admin':
        return jsonify({"error": "Tylko administrator może zarządzać zależnościami"}), 403

    depends_on_title = dependency.depends_on_task.title if dependency.depends_on_task else None
    db.session.delete(dependency)
    db.session.add(ActivityLog(
        user_id=user_id,
        task_id=task.id,
        action='dependency_removed',
        details={'title': depends_on_title},
    ))
    db.session.commit()
    db.session.refresh(task)

    emit_task_event("dependency_removed", user, task=task)
    return jsonify(task.to_dict())

@tasks_bp.route('/tasks/quick-add', methods=['POST'])
@login_required
def quick_add_task():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if user.role != 'admin':
        return jsonify({"error": "Tylko administrator może tworzyć zadania"}), 403

    text = (request.get_json() or {}).get('text', '').strip()
    if not text:
        return jsonify({"error": "Podaj treść zadania"}), 400

    parsed = parse_quick_task(text)
    if not parsed["title"]:
        return jsonify({"error": "Nie udało się odczytać tytułu zadania"}), 400

    assignees = User.query.filter(User.username.in_(parsed["assignee_names"])).all() if parsed["assignee_names"] else []
    task, result = create_task_record(
        user=user,
        title=parsed["title"],
        priority=parsed["priority"],
        project_name=parsed["project"],
        due_date=parsed["due_date"],
        assignee_ids=[assignee.id for assignee in assignees],
    )
    if task is None:
        message, status = result
        return jsonify({"error": message}), status

    notifications = create_assignment_notifications(task, user, assignees)
    db.session.add(ActivityLog(user_id=user_id, task_id=task.id, action='created', details={'title': task.title, 'source': 'quick_add'}))
    db.session.commit()

    send_project_activity_emails(
        task.project_record,
        user,
        "Dodano zadanie",
        task=task,
        exclude_user_ids=[assignee.id for assignee in assignees],
    )
    emit_task_event("created", user, task=task)
    emit_notifications(notifications)
    return jsonify({
        "task": task.to_dict(),
        "parsed": {
            "project": task.project,
            "priority": task.priority,
            "due_date": task.due_date.isoformat() if task.due_date else None,
            "assignees": [assignee.username for assignee in assignees],
        },
    }), 201

@tasks_bp.route('/tasks', methods=['POST'])
@login_required
def create_task():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if user.role != 'admin':
        return jsonify({"error": "Tylko administrator może tworzyć zadania"}), 403

    data = request.get_json()
    schema = TaskSchema()
    try:
        validated = schema.load(data)
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    due_date = parse_due_date(validated.get('due_date'))
    project, project_error = resolve_project(validated.get('project_id'), validated.get('project'), user)
    if project_error:
        message, status = project_error
        return jsonify({"error": message}), status

    task = Task(
        user_id=user_id,
        title=validated.get("title", "Untitled"),
        priority=validated.get("priority", "medium"),
        project=project.name,
        project_id=project.id,
        due_date=due_date,
        notes=validated.get("notes", "")
    )

    assignees = update_task_assignees(task, validated.get('assignees', []))

    db.session.add(task)
    db.session.flush()

    task_link = url_for('index', _external=True) + f'tasks/{task.id}'
    for assignee in assignees:
        if assignee.email:
            subject = f"Zostałeś przypisany do zadania: {task.title}"
            body = get_task_assignment_body(task.title, assignee.username, task_link)
            send_email(assignee.email, subject, body)

    log = ActivityLog(user_id=user_id, task_id=task.id, action='created', details={'title': task.title})
    db.session.add(log)
    notifications = create_assignment_notifications(task, user, assignees)
    db.session.commit()

    send_project_activity_emails(
        task.project_record,
        user,
        "Dodano zadanie",
        task=task,
        exclude_user_ids=[assignee.id for assignee in assignees],
    )
    emit_task_event("created", user, task=task)
    emit_notifications(notifications)

    return jsonify(task.to_dict()), 201

@tasks_bp.route('/tasks/<int:task_id>', methods=['PUT'])
@login_required
def update_task(task_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    task = db.session.get(Task, task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    if user.role != 'admin':
        return jsonify({"error": "Only admins can update tasks"}), 403

    old_values = {
        'title': task.title,
        'priority': task.priority,
        'project': task.project,
        'project_id': task.project_id,
        'due_date': task.due_date.isoformat() if task.due_date else None,
        'notes': task.notes,
        'completed': task.completed,
        'status': task.status,
        'assignee_ids': sorted(assignee.id for assignee in task.assignees),
    }
    old_status = task.status
    was_done = task_is_done(task)
    old_assignee_ids = {assignee.id for assignee in task.assignees}

    data = request.get_json()
    for key, value in data.items():
        if key in ('assignee_ids', 'assignees'):
            if len(value or []) > 1:
                return jsonify({"error": "Zadanie może mieć tylko jednego przypisanego użytkownika."}), 400
            update_task_assignees(task, value or [])
        elif key == 'project_id':
            project, project_error = resolve_project(value, None, user)
            if project_error:
                message, status = project_error
                return jsonify({"error": message}), status
            set_task_project(task, project)
        elif key == 'project':
            project, _ = resolve_project(None, value, user)
            set_task_project(task, project)
        elif key in TASK_ALLOWED_FIELDS and hasattr(task, key):
            if key == 'due_date':
                value = parse_due_date(value)
            setattr(task, key, value)

    if not was_done and task_is_done(task) and task_blocks_completion(task):
        db.session.rollback()
        return blocked_completion_response(task)

    db.session.commit()

    task_link = url_for('index', _external=True) + f'tasks/{task.id}' # Assuming tasks are viewed at /tasks/{id}

    # Send email for status change
    if 'status' in data and old_status != task.status:
        if task.owner and task.owner.email:
            subject = f"Zmiana statusu zadania: {task.title}"
            body = get_task_status_change_body(task.title, old_status, task.status, task_link)
            send_email(task.owner.email, subject, body)

    # Send email for new assignments
    assignment_notifications = []
    if 'assignee_ids' in data or 'assignees' in data:
        for assignee_user in task.assignees:
            if assignee_user.id in old_assignee_ids:
                continue
            assignment_notifications.extend(create_assignment_notifications(task, user, [assignee_user]))
            if not assignee_user.email:
                continue
            subject = f"Zostałeś przypisany do zadania: {task.title}"
            body = get_task_assignment_body(task.title, assignee_user.username, task_link)
            send_email(assignee_user.email, subject, body)

    emit_task_event("updated", user, task=task)

    changes = {}
    new_values = {
        'title': task.title,
        'priority': task.priority,
        'project': task.project,
        'project_id': task.project_id,
        'due_date': task.due_date.isoformat() if task.due_date else None,
        'notes': task.notes,
        'completed': task.completed,
        'status': task.status,
        'assignee_ids': sorted(assignee.id for assignee in task.assignees),
    }
    for key, old_value in old_values.items():
        if new_values[key] != old_value:
            changes[key] = {'from': old_value, 'to': new_values[key]}

    log = ActivityLog(user_id=user_id, task_id=task_id, action='updated', details={'title': task.title, 'changes': changes})
    db.session.add(log)
    db.session.commit()
    if changes:
        send_project_activity_emails(
            task.project_record,
            user,
            "Zaktualizowano zadanie",
            task=task,
            exclude_user_ids=[assignee.id for assignee in task.assignees if assignee.id not in old_assignee_ids],
        )
    emit_notifications(assignment_notifications)

    return jsonify(task.to_dict())

@tasks_bp.route('/tasks/<int:task_id>/complete', methods=['PUT'])
@login_required
def complete_task(task_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    task = db.session.get(Task, task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    if not user_can_access_task(user, task):
        return jsonify({"error": "Can only complete tasks assigned to you"}), 403

    if not task.completed and task_blocks_completion(task):
        return blocked_completion_response(task)

    will_complete = not task.completed
    task.completed = not task.completed
    task.status = 'done' if task.completed else 'todo'
    notifications = create_unblocked_notifications(task, user) if will_complete else []

    log = ActivityLog(user_id=user_id, task_id=task_id, action='completed' if task.completed else 'reopened')
    db.session.add(log)
    db.session.commit()

    send_task_completion_emails(task, user)
    send_project_activity_emails(
        task.project_record,
        user,
        "Zakończono zadanie" if task.completed else "Przywrócono zadanie",
        task=task,
        exclude_user_ids=[recipient.id for recipient in task_email_users(task)],
    )
    emit_task_event("completed" if task.completed else "reopened", user, task=task)
    emit_notifications(notifications)

    return jsonify(task.to_dict())

@tasks_bp.route('/tasks/<int:task_id>', methods=['DELETE'])
@login_required
def delete_task(task_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    task = db.session.get(Task, task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    if user.role != 'admin':
        return jsonify({"error": "Only admins can delete tasks"}), 403

    project = task.project_record
    task_recipients = task_email_users(task)
    task_snapshot = task.to_dict()
    db.session.delete(task)
    db.session.commit()

    send_project_activity_emails(project, user, "Usunięto zadanie", extra_users=task_recipients)
    emit_task_event("deleted", user, task_ids=[task_id], task_id=task_id, task_payload=task_snapshot)
    return jsonify({"message": "Zadanie usunięte"}), 200

@tasks_bp.route('/tasks/<int:task_id>/comments', methods=['POST'])
@login_required
def add_comment(task_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    task = db.session.get(Task, task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    if not user_can_access_task(user, task):
        return jsonify({"error": "Permission denied"}), 403

    data = request.get_json()
    schema = CommentSchema()
    try:
        validated = schema.load(data)
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    comment = Comment(
        task_id=task_id,
        author=user.username,
        text=validated.get("text", "")
    )
    db.session.add(comment)
    mentioned_usernames = extract_mentions(comment.text)
    mentioned_users = User.query.filter(User.username.in_(mentioned_usernames)).all() if mentioned_usernames else []
    mentioned_names = [mentioned.username for mentioned in mentioned_users]
    log = ActivityLog(
        user_id=user_id,
        task_id=task_id,
        action='commented',
        details={'text': comment.text, 'mentions': mentioned_names},
    )
    db.session.add(log)
    mention_notifications = []
    for mentioned in mentioned_users:
        mention_notifications.append(create_notification(
            user_id=mentioned.id,
            notification_type='mention',
            message=f"{user.username} wspomniał(a) Cię w zadaniu: {task.title}",
            task=task,
            actor=user,
        ))
        db.session.add(ActivityLog(
            user_id=mentioned.id,
            task_id=task_id,
            action='mentioned',
            details={'by': user.username, 'text': comment.text},
        ))
    db.session.commit()
    db.session.refresh(task)

    send_project_activity_emails(task.project_record, user, "Dodano komentarz", task=task)
    emit_task_event(
        "mentioned" if mentioned_names else "commented",
        user,
        task=task,
        extra={"mentioned_usernames": mentioned_names} if mentioned_names else None,
    )
    emit_notifications(mention_notifications)
    return jsonify(comment.to_dict()), 201

@tasks_bp.route('/tasks/<int:task_id>/activity', methods=['GET'])
@login_required
def get_task_activity(task_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    task = db.session.get(Task, task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    if not user_can_access_task(user, task):
        return jsonify({"error": "Permission denied"}), 403

    logs = ActivityLog.query.filter_by(task_id=task_id).order_by(ActivityLog.created_at.desc()).all()
    users = {
        log_user.id: log_user.username
        for log_user in User.query.filter(User.id.in_({log.user_id for log in logs if log.user_id})).all()
    }
    activity = []
    for log in logs:
        item = log.to_dict()
        item['username'] = users.get(log.user_id, 'System')
        activity.append(item)

    return jsonify({'activity': activity})

@tasks_bp.route('/tasks/<int:task_id>/subtasks', methods=['POST'])
@login_required
def add_subtask(task_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    task = db.session.get(Task, task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    if not user_can_access_task(user, task):
        return jsonify({"error": "Permission denied"}), 403

    data = request.get_json()
    schema = SubtaskSchema()
    try:
        validated = schema.load(data)
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    subtask = Subtask(
        task_id=task_id,
        title=validated.get("title", "Subtask")
    )
    db.session.add(subtask)

    log = ActivityLog(user_id=user_id, task_id=task_id, action='subtask_created', details={'title': subtask.title})
    db.session.add(log)
    db.session.commit()
    db.session.refresh(task)

    send_project_activity_emails(task.project_record, user, "Dodano podzadanie", task=task)
    emit_task_event("subtask_created", user, task=task)
    return jsonify(subtask.to_dict()), 201

@tasks_bp.route('/subtasks/<int:subtask_id>/complete', methods=['PUT'])
@login_required
def complete_subtask(subtask_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    subtask = db.session.get(Subtask, subtask_id)
    if not subtask:
        return jsonify({"error": "Subtask not found"}), 404

    task = db.session.get(Task, subtask.task_id)
    if not user_can_access_task(user, task):
        return jsonify({"error": "Permission denied"}), 403

    subtask.completed = not subtask.completed

    log = ActivityLog(user_id=user_id, task_id=task.id, action='subtask_toggle', details={'subtask': subtask.title, 'completed': subtask.completed})
    db.session.add(log)
    db.session.commit()
    db.session.refresh(task)

    send_project_activity_emails(
        task.project_record,
        user,
        "Zakończono podzadanie" if subtask.completed else "Przywrócono podzadanie",
        task=task,
    )
    emit_task_event("subtask_completed" if subtask.completed else "subtask_reopened", user, task=task)
    return jsonify(subtask.to_dict())

@tasks_bp.route('/subtasks/<int:subtask_id>', methods=['DELETE'])
@login_required
def delete_subtask(subtask_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    subtask = db.session.get(Subtask, subtask_id)
    if not subtask:
        return jsonify({"error": "Subtask not found"}), 404

    task = db.session.get(Task, subtask.task_id)
    if not user_can_access_task(user, task):
        return jsonify({"error": "Permission denied"}), 403

    db.session.delete(subtask)
    db.session.commit()
    db.session.refresh(task)
    send_project_activity_emails(task.project_record, user, "Usunięto podzadanie", task=task)
    emit_task_event("subtask_deleted", user, task=task)
    return jsonify({"message": "Subtask deleted"}), 200

@tasks_bp.route('/tasks/filter', methods=['GET'])
@login_required
def filter_tasks():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    query = Task.query
    if user.role != 'admin':
        query = assigned_task_query(user)

    assigned_to = request.args.get('assigned_to')
    priority = request.args.get('priority')
    project = request.args.get('project')
    completed = request.args.get('completed')

    if assigned_to:
        query = query.filter(Task.assignees.any(User.username == assigned_to))
    if priority:
        query = query.filter_by(priority=priority)
    if project:
        query = query.filter_by(project=project)
    if completed is not None:
        query = query.filter_by(completed=(completed.lower() == 'true'))

    tasks = query.all()
    return jsonify({"tasks": [t.to_dict() for t in tasks]})

@tasks_bp.route('/tasks/by-project', methods=['GET'])
@login_required
def tasks_by_project():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    tasks = visible_task_query(user).all()

    projects = {}
    if user.role == 'admin':
        for project in Project.query.order_by(Project.name.asc()).all():
            projects[project.name] = []
    for task in tasks:
        proj = task.project
        if proj not in projects:
            projects[proj] = []
        projects[proj].append(task.to_dict())
    return jsonify(projects)

@tasks_bp.route('/projects', methods=['GET'])
@login_required
def get_projects():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    projects = []

    for project in visible_projects_for_user(user):
        project_data = project.to_dict(include_tasks=False)
        if user.role == 'admin':
            project_tasks = project.tasks
        else:
            project_tasks = [task for task in project.tasks if user_can_access_task(user, task)]
        project_data['tasks'] = [task.to_dict() for task in project_tasks]
        projects.append(project_data)

    return jsonify({'projects': projects})

@tasks_bp.route('/projects', methods=['POST'])
@login_required
def create_project():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if user.role != 'admin':
        return jsonify({"error": "Tylko administrator może tworzyć projekty"}), 403

    schema = ProjectSchema()
    try:
        validated = schema.load(request.get_json() or {})
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    name = normalize_project_name(validated.get('name'))
    if Project.query.filter_by(name=name).first():
        return jsonify({"error": "Projekt o tej nazwie już istnieje"}), 409

    project = Project(
        name=name,
        description=validated.get('description') or '',
        color=validated.get('color') or '#3b82f6',
        archived=validated.get('archived', False),
        created_by_id=user_id,
    )
    update_project_members(project, validated.get('member_ids', []))
    db.session.add(project)
    db.session.commit()
    socketio.emit("task_action", {
        "action": "project_created",
        "user": user.username,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "project": project.to_dict(include_tasks=False),
    })
    return jsonify(project.to_dict(include_tasks=False)), 201

@tasks_bp.route('/project-templates', methods=['GET'])
@login_required
def get_project_templates():
    return jsonify({
        "templates": [
            {
                "id": template_id,
                "name": template["name"],
                "description": template["description"],
                "task_count": len(template["tasks"]),
                "color": template["color"],
            }
            for template_id, template in PROJECT_TEMPLATES.items()
        ]
    })

@tasks_bp.route('/project-templates/<template_id>/use', methods=['POST'])
@login_required
def use_project_template(template_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if user.role != 'admin':
        return jsonify({"error": "Tylko administrator może tworzyć projekty z szablonu"}), 403

    template = PROJECT_TEMPLATES.get(template_id)
    if not template:
        return jsonify({"error": "Template not found"}), 404

    payload = request.get_json() or {}
    name = normalize_project_name(payload.get("name") or template["name"])
    if Project.query.filter_by(name=name).first():
        return jsonify({"error": "Projekt o tej nazwie już istnieje"}), 409
    start_date = parse_due_date(payload.get("start_date")) or date.today()

    project = Project(
        name=name,
        description=payload.get("description") or template["description"],
        color=payload.get("color") or template["color"],
        created_by_id=user_id,
    )
    db.session.add(project)
    db.session.flush()

    created_tasks = []
    for template_task in template["tasks"]:
        task = Task(
            user_id=user_id,
            title=template_task["title"],
            priority=template_task.get("priority", "medium"),
            project=project.name,
            project_id=project.id,
            due_date=start_date + timedelta(days=template_task.get("due_offset", 1)),
            notes=template_task.get("notes", ""),
        )
        db.session.add(task)
        db.session.flush()
        created_tasks.append(task)
        db.session.add(ActivityLog(user_id=user_id, task_id=task.id, action='created', details={'title': task.title, 'source': 'project_template'}))

    for task_index, template_task in enumerate(template["tasks"]):
        for dependency_index in template_task.get("depends_on", []):
            db.session.add(TaskDependency(
                task_id=created_tasks[task_index].id,
                depends_on_task_id=created_tasks[dependency_index].id,
            ))

    db.session.commit()
    socketio.emit("task_action", {
        "action": "project_template_used",
        "user": user.username,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "project": project.to_dict(include_tasks=False),
        "task_ids": [task.id for task in created_tasks],
    })
    return jsonify(project.to_dict(include_tasks=True)), 201

@tasks_bp.route('/projects/<int:project_id>', methods=['PUT'])
@login_required
def update_project(project_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if user.role != 'admin':
        return jsonify({"error": "Tylko administrator może edytować projekty"}), 403

    project = db.session.get(Project, project_id)
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
        duplicate = Project.query.filter(Project.name == name, Project.id != project.id).first()
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
    socketio.emit("task_action", {
        "action": "project_updated",
        "user": user.username,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "project": project.to_dict(include_tasks=False),
    })
    return jsonify(project.to_dict(include_tasks=True))

@tasks_bp.route('/projects/<int:project_id>/completion', methods=['GET'])
@login_required
def get_project_completion(project_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    project = db.session.get(Project, project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404
    if not user_can_access_project(user, project):
        return jsonify({"error": "Permission denied"}), 403

    return jsonify(project_completion_status(project))

@tasks_bp.route('/projects/<int:project_id>/complete', methods=['POST'])
@login_required
def complete_project(project_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if user.role != 'admin':
        return jsonify({"error": "Tylko administrator może kończyć projekty"}), 403

    project = db.session.get(Project, project_id)
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
    socketio.emit("task_action", {
        "action": "project_completed",
        "user": user.username,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "project": project.to_dict(include_tasks=False),
    })

    data = project.to_dict(include_tasks=True)
    data["completion"] = completion
    return jsonify(data)

@tasks_bp.route('/projects/<int:project_id>', methods=['DELETE'])
@login_required
def archive_project(project_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if user.role != 'admin':
        return jsonify({"error": "Tylko administrator może archiwizować projekty"}), 403

    project = db.session.get(Project, project_id)
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
    socketio.emit("task_action", {
        "action": "project_archived",
        "user": user.username,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "project": project.to_dict(include_tasks=False),
    })
    return jsonify(project.to_dict(include_tasks=False))

@tasks_bp.route('/tasks/search', methods=['GET'])
@login_required
def search_tasks():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    query_str = request.args.get('q', '').strip()

    if not query_str:
        return jsonify({'tasks': []})

    if user.role == 'admin':
        tasks = Task.query.filter(
            Task.title.ilike(f'%{query_str}%') | Task.notes.ilike(f'%{query_str}%')
        ).all()
    else:
        tasks = assigned_task_query(user).filter(
            (Task.title.ilike(f'%{query_str}%')) | (Task.notes.ilike(f'%{query_str}%'))
        ).all()

    return jsonify({'tasks': [t.to_dict() for t in tasks]})

@tasks_bp.route('/tasks/<int:task_id>/tags/<int:tag_id>', methods=['POST', 'DELETE'])
@login_required
def manage_task_tags(task_id, tag_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    task = db.session.get(Task, task_id)
    tag = db.session.get(Tag, tag_id)
    if not task or not tag:
        return jsonify({"error": "Not found"}), 404

    if not user_can_access_task(user, task):
        return jsonify({"error": "Permission denied"}), 403

    if tag.user_id != user_id:
        return jsonify({"error": "Not found"}), 404

    if request.method == 'POST':
        if tag not in task.tags:
            task.tags.append(tag)
    else:
        if tag in task.tags:
            task.tags.remove(tag)

    db.session.commit()
    emit_task_event("updated", user, task=task)
    return jsonify(task.to_dict())

@tasks_bp.route('/tasks/bulk/complete', methods=['PUT'])
@login_required
def bulk_complete_tasks():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if user.role != 'admin':
        return jsonify({"error": "Tylko administrator może edytować masowo"}), 403

    data = request.get_json()
    task_ids = data.get('task_ids', [])

    if len(task_ids) > BULK_MAX_TASKS:
        return jsonify({"error": f"Maksymalna liczba zadań w operacji masowej: {BULK_MAX_TASKS}"}), 400

    tasks = [task for task_id in task_ids if (task := db.session.get(Task, task_id))]
    blocked_tasks = [task for task in tasks if not task_is_done(task) and task_blocks_completion(task)]
    if blocked_tasks:
        return jsonify({
            "error": "Nie można zakończyć zadań, które mają otwarte zależności lub podzadania.",
            "blocked_tasks": [task.summary_dict() for task in blocked_tasks],
        }), 409

    for task in tasks:
        task.completed = True
        task.status = 'done'

    db.session.commit()
    emit_task_event("bulk_completed", user, task_ids=task_ids)
    return jsonify({"message": f"Zakończono {len(task_ids)} zadań"}), 200

@tasks_bp.route('/tasks/bulk/delete', methods=['DELETE'])
@login_required
def bulk_delete_tasks():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if user.role != 'admin':
        return jsonify({"error": "Tylko administrator może usuwać masowo"}), 403

    data = request.get_json()
    task_ids = data.get('task_ids', [])

    if len(task_ids) > BULK_MAX_TASKS:
        return jsonify({"error": f"Maksymalna liczba zadań w operacji masowej: {BULK_MAX_TASKS}"}), 400

    count = 0
    for task_id in task_ids:
        task = db.session.get(Task, task_id)
        if task:
            db.session.delete(task)
            count += 1

    db.session.commit()
    emit_task_event("bulk_deleted", user, task_ids=task_ids)
    return jsonify({"message": f"Usunięto {count} zadań"}), 200

@tasks_bp.route('/tasks/bulk/update', methods=['PUT'])
@login_required
def bulk_update_tasks():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if user.role != 'admin':
        return jsonify({"error": "Tylko administrator może edytować masowo"}), 403

    data = request.get_json()
    task_ids = data.get('task_ids', [])
    updates = data.get('updates', {})

    if len(task_ids) > BULK_MAX_TASKS:
        return jsonify({"error": f"Maksymalna liczba zadań w operacji masowej: {BULK_MAX_TASKS}"}), 400
    for assignee_key in ('assignee_ids', 'assignees'):
        if assignee_key in updates and len(updates.get(assignee_key) or []) > 1:
            return jsonify({"error": "Zadanie może mieć tylko jednego przypisanego użytkownika."}), 400

    tasks = [task for task_id in task_ids if (task := db.session.get(Task, task_id))]
    marks_done = updates.get('completed') is True or updates.get('status') == 'done'
    blocked_tasks = [task for task in tasks if marks_done and not task_is_done(task) and task_blocks_completion(task)]
    if blocked_tasks:
        return jsonify({
            "error": "Nie można zakończyć zadań, które mają otwarte zależności lub podzadania.",
            "blocked_tasks": [task.summary_dict() for task in blocked_tasks],
        }), 409

    for task in tasks:
        for key, value in updates.items():
            if key in ('assignee_ids', 'assignees'):
                update_task_assignees(task, value or [])
            elif key == 'project_id':
                project, project_error = resolve_project(value, None, user)
                if project_error:
                    message, status = project_error
                    return jsonify({"error": message}), status
                set_task_project(task, project)
            elif key == 'project':
                project, _ = resolve_project(None, value, user)
                set_task_project(task, project)
            elif key in TASK_ALLOWED_FIELDS and hasattr(task, key):
                if key == 'due_date':
                    value = parse_due_date(value)
                setattr(task, key, value)

    db.session.commit()
    emit_task_event("bulk_updated", user, task_ids=task_ids)
    return jsonify({"message": f"Zaktualizowano {len(task_ids)} zadań"}), 200
