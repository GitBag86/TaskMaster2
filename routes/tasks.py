import re

from flask import current_app, g, request, jsonify, session, url_for
from datetime import date, datetime, timedelta, timezone
from marshmallow import ValidationError
from sqlalchemy.orm import selectinload, joinedload
from routes import tasks_bp
from utils.realtime import emit_task_event, emit_team_event
from models import (
    db,
    User,
    Task,
    Comment,
    Subtask,
    ActivityLog,
    Tag,
    Project,
    TaskDependency,
)
from schemas import TaskSchema, CommentSchema, SubtaskSchema, DependencySchema
from routes.auth import login_required
from utils import email_sender
from utils.notifications import create_notification, emit_notifications
from utils.delete_helpers import prepare_task_for_delete
from utils.errors import CrossTeamReferenceError
from utils.scoping import get_team_resource_or_404, team_scoped

TASK_ALLOWED_FIELDS = {'title', 'priority', 'project', 'project_id', 'due_date', 'notes', 'completed', 'status'}
USER_START_TASK_FIELDS = {'status', 'completed'}
BULK_MAX_TASKS = 100

def app_url(path=''):
    base_url = current_app.config.get("PUBLIC_BASE_URL")
    if base_url:
        return f"{base_url.rstrip('/')}/{path.lstrip('/')}"
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
        email_sender.enqueue_email(
            recipient.email,
            f"Zadanie {action_label}: {task.title}",
            email_sender.get_task_completion_body(task.title, recipient.username, actor.username, task.completed, link),
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
        email_sender.enqueue_email(
            recipient.email,
            f"Zmiana w projekcie: {project.name}",
            email_sender.get_project_activity_body(
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
        email_sender.enqueue_email(
            recipient.email,
            f"Projekt zakończony: {project.name}",
            email_sender.get_project_completed_body(project.name, recipient.username, actor.username, link),
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
    return g.get('current_role') in ('manager', 'super_admin') or user in task.assignees

def is_user_start_task_update(data):
    if not isinstance(data, dict) or not data:
        return False
    if set(data) - USER_START_TASK_FIELDS:
        return False
    return data.get('status') == 'in_progress' and data.get('completed', False) is False

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
            for dependency in team_scoped(TaskDependency.query, TaskDependency).filter_by(task_id=current_id).all()
        )

    return False

def validate_new_dependency(task, depends_on_task):
    if depends_on_task is None:
        return ("Dependency task not found", 404)
    if task.team_id != depends_on_task.team_id:
        raise CrossTeamReferenceError()
    if depends_on_task.id == task.id:
        return ("Zadanie nie może zależeć od samego siebie", 400)
    if TaskDependency.query.filter_by(task_id=task.id, depends_on_task_id=depends_on_task.id).first():
        return ("Ta zależność już istnieje", 409)
    if would_create_dependency_cycle(task.id, depends_on_task.id):
        return ("Ta zależność utworzyłaby cykl", 409)
    return None

def bulk_scoped_tasks_or_error(task_ids):
    tasks = []
    for task_id in task_ids:
        task = db.session.get(Task, task_id)
        if task is None:
            continue
        if task.team_id != g.get('current_team_id'):
            raise CrossTeamReferenceError()
        tasks.append(task)
    return tasks

def assigned_task_query(user):
    return team_scoped(Task.query, Task).filter(Task.assignees.any(User.id == user.id))

def visible_task_query(user):
    if g.get('current_role') in ('manager', 'super_admin'):
        return team_scoped(Task.query, Task)
    return assigned_task_query(user)


def _eager_task_options():
    """Eager-loading options for Task to avoid N+1 in to_dict() / dependency checks.

    Use with `query.options(*_eager_task_options())` whenever a list of full
    Task dicts is being serialized, or whenever we need to inspect dependencies/
    subtasks for many tasks (e.g. /tasks/blocked, /tasks/today).
    """
    return (
        selectinload(Task.assignees),
        selectinload(Task.comments),
        selectinload(Task.subtasks),
        selectinload(Task.tags),
        selectinload(Task.dependencies).selectinload(TaskDependency.depends_on_task),
        selectinload(Task.dependent_links).selectinload(TaskDependency.task),
        joinedload(Task.project_record).selectinload(Project.members),
    )

def assignee_names(task):
    return ', '.join(user.username for user in task.assignees)

def update_task_assignees(task, assignee_ids):
    assignee_ids = assignee_ids or []
    if len(assignee_ids) > 1:
        raise ValueError("Zadanie może mieć tylko jednego przypisanego użytkownika.")
    if not assignee_ids:
        task.assignees = []
        return []
    users = User.query.filter(User.id.in_(assignee_ids)).all()
    if len(users) != len(set(assignee_ids)) or any(user.team_id != g.get('current_team_id') for user in users):
        raise CrossTeamReferenceError()
    task.assignees = users
    return users

def update_project_members(project, member_ids):
    if not member_ids:
        project.members = []
        return []
    users = User.query.filter(User.id.in_(member_ids or [])).all()
    if len(users) != len(set(member_ids or [])) or any(user.team_id != g.get('current_team_id') for user in users):
        raise CrossTeamReferenceError()
    project.members = users
    return users

def normalize_project_name(name):
    return (name or 'Ogólny').strip() or 'Ogólny'

def get_or_create_project(name, user, color='#3b82f6', description=''):
    project_name = normalize_project_name(name)
    project = team_scoped(Project.query, Project).filter_by(name=project_name).first()
    if project:
        return project
    project = Project(
        name=project_name,
        description=description or '',
        color=color or '#3b82f6',
        created_by_id=user.id if user else None,
        team_id=g.get('current_team_id'),
    )
    db.session.add(project)
    db.session.flush()
    return project

def resolve_project(project_id, project_name, user):
    if project_id:
        project = db.session.get(Project, project_id)
        if not project:
            return None, ("Project not found", 404)
        if project.team_id != g.get('current_team_id'):
            raise CrossTeamReferenceError()
        return project, None
    return get_or_create_project(project_name, user), None

def set_task_project(task, project):
    task.project_id = project.id
    task.project = project.name

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
        "title_tokens": title_tokens,
        "assignee_names": assignee_names,
        "priority": priority,
        "project": project_name or 'Ogólny',
        "due_date": due_date,
    }

def restore_unresolved_assignee_tokens(parsed, resolved_assignees):
    resolved_names = {assignee.username for assignee in resolved_assignees}
    unresolved_tokens = [
        f"@{name}" for name in parsed["assignee_names"] if name not in resolved_names
    ]
    if not unresolved_tokens:
        return parsed["title"]
    return " ".join([*parsed["title_tokens"], *unresolved_tokens]).strip()

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
        team_id=g.get('current_team_id'),
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

@tasks_bp.route('/tasks/<int:task_id>', methods=['GET'])
@login_required
def get_task(task_id):
    user = db.session.get(User, session.get('user_id'))
    task = get_team_resource_or_404(Task, task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    if not user_can_access_task(user, task):
        return jsonify({"error": "Permission denied"}), 403
    return jsonify(task.to_dict())


@tasks_bp.route('/tasks', methods=['GET'])
@login_required
def get_tasks():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    per_page = min(per_page, 100)

    query = visible_task_query(user).options(*_eager_task_options())

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
        .options(*_eager_task_options())
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

    # SQL-side filter: only fetch tasks that are open (not done) AND have at least
    # one open dependency. This avoids loading the entire team task list and
    # checking dependencies in Python (was N+1 over thousands of tasks).
    open_dep_subquery = (
        db.session.query(TaskDependency.task_id)
        .join(Task, TaskDependency.depends_on_task_id == Task.id)
        .filter(Task.completed.is_(False), Task.status != 'done')
        .subquery()
    )

    blocked_tasks = (
        visible_task_query(user)
        .options(*_eager_task_options())
        .filter(Task.completed.is_(False), Task.status != 'done')
        .filter(Task.id.in_(db.session.query(open_dep_subquery.c.task_id)))
        .order_by(Task.created_at.desc())
        .all()
    )

    return jsonify({
        "tasks": [task.to_dict() for task in blocked_tasks],
        "total": len(blocked_tasks),
    })

@tasks_bp.route('/tasks/dependency-board', methods=['GET'])
@login_required
def get_dependency_board():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    tasks = visible_task_query(user).options(*_eager_task_options()).all()
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
    task = get_team_resource_or_404(Task, task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    if not user_can_access_task(user, task):
        return jsonify({"error": "Permission denied"}), 403

    if request.method == 'GET':
        return jsonify({
            "dependencies": [dependency.to_dict() for dependency in task.dependencies],
            "blocked_by": [dependency_task.summary_dict() for dependency_task in task_open_dependencies(task)],
        })

    if g.get('current_role') not in ('manager', 'super_admin'):
        return jsonify({"error": "Tylko administrator może zarządzać zależnościami"}), 403

    schema = DependencySchema()
    try:
        validated = schema.load(request.get_json() or {})
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    depends_on_task_id = validated['depends_on_task_id']
    depends_on_task = db.session.get(Task, depends_on_task_id)
    dependency_error = validate_new_dependency(task, depends_on_task)
    if dependency_error:
        message, status = dependency_error
        return jsonify({"error": message}), status

    dependency = TaskDependency(task_id=task.id, depends_on_task_id=depends_on_task.id, team_id=task.team_id)
    db.session.add(dependency)
    db.session.add(ActivityLog(
        user_id=user_id,
        task_id=task.id,
        team_id=task.team_id,
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
    if not dependency or dependency.team_id != g.get('current_team_id'):
        return jsonify({"error": "Not found"}), 404

    task = dependency.task
    if not task or not user_can_access_task(user, task):
        return jsonify({"error": "Permission denied"}), 403
    if g.get('current_role') not in ('manager', 'super_admin'):
        return jsonify({"error": "Tylko administrator może zarządzać zależnościami"}), 403

    depends_on_title = dependency.depends_on_task.title if dependency.depends_on_task else None
    db.session.delete(dependency)
    db.session.add(ActivityLog(
        user_id=user_id,
        task_id=task.id,
        team_id=task.team_id,
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

    if g.get('current_role') not in ('manager', 'super_admin'):
        return jsonify({"error": "Tylko administrator może tworzyć zadania"}), 403

    text = (request.get_json() or {}).get('text', '').strip()
    if not text:
        return jsonify({"error": "Podaj treść zadania"}), 400

    parsed = parse_quick_task(text)
    if not parsed["title"] and not parsed["assignee_names"]:
        return jsonify({"error": "Nie udało się odczytać tytułu zadania"}), 400

    assignees = User.query.filter(
        User.username.in_(parsed["assignee_names"]),
        User.team_id == g.get('current_team_id'),
    ).all() if parsed["assignee_names"] else []
    title = restore_unresolved_assignee_tokens(parsed, assignees)
    if not title:
        return jsonify({"error": "Nie udało się odczytać tytułu zadania"}), 400
    task, result = create_task_record(
        user=user,
        title=title,
        priority=parsed["priority"],
        project_name=parsed["project"],
        due_date=parsed["due_date"],
        assignee_ids=[assignee.id for assignee in assignees],
    )
    if task is None:
        message, status = result
        return jsonify({"error": message}), status

    notifications = create_assignment_notifications(task, user, assignees)
    db.session.add(ActivityLog(user_id=user_id, task_id=task.id, team_id=task.team_id, action='created', details={'title': task.title, 'source': 'quick_add'}))
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

    if g.get('current_role') not in ('manager', 'super_admin'):
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
        notes=validated.get("notes", ""),
        team_id=g.get('current_team_id'),
    )

    assignees = update_task_assignees(task, validated.get('assignees', []))

    db.session.add(task)
    db.session.flush()

    task_link = url_for('index', _external=True) + f'tasks/{task.id}'
    for assignee in assignees:
        if assignee.email:
            subject = f"Zostałeś przypisany do zadania: {task.title}"
            body = email_sender.get_task_assignment_body(task.title, assignee.username, task_link)
            email_sender.enqueue_email(assignee.email, subject, body)

    log = ActivityLog(user_id=user_id, task_id=task.id, team_id=task.team_id, action='created', details={'title': task.title})
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
    task = get_team_resource_or_404(Task, task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    data = request.get_json() or {}
    schema = TaskSchema(partial=True)
    try:
        validated = schema.load(data)
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    if g.get('current_role') not in ('manager', 'super_admin'):
        if not user_can_access_task(user, task) or not is_user_start_task_update(data):
            return jsonify({"error": "Only admins can update tasks"}), 403
        if task_is_done(task):
            return jsonify({"error": "Nie można rozpocząć zakończonego zadania"}), 409

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

    for key, value in validated.items():
        if key == 'assignees':
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
            setattr(task, key, value)

    if not was_done and task_is_done(task) and task_blocks_completion(task):
        db.session.rollback()
        return blocked_completion_response(task)

    db.session.commit()

    task_link = url_for('index', _external=True) + f'tasks/{task.id}' # Assuming tasks are viewed at /tasks/{id}

    # Send email for status change
    if 'status' in validated and old_status != task.status:
        if task.owner and task.owner.email:
            subject = f"Zmiana statusu zadania: {task.title}"
            body = email_sender.get_task_status_change_body(task.title, old_status, task.status, task_link)
            email_sender.enqueue_email(task.owner.email, subject, body)

    # Send email for new assignments
    assignment_notifications = []
    if 'assignees' in validated:
        for assignee_user in task.assignees:
            if assignee_user.id in old_assignee_ids:
                continue
            assignment_notifications.extend(create_assignment_notifications(task, user, [assignee_user]))
            if not assignee_user.email:
                continue
            subject = f"Zostałeś przypisany do zadania: {task.title}"
            body = email_sender.get_task_assignment_body(task.title, assignee_user.username, task_link)
            email_sender.enqueue_email(assignee_user.email, subject, body)

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

    log = ActivityLog(user_id=user_id, task_id=task_id, team_id=task.team_id, action='updated', details={'title': task.title, 'changes': changes})
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
    task = get_team_resource_or_404(Task, task_id)
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

    log = ActivityLog(user_id=user_id, task_id=task_id, team_id=task.team_id, action='completed' if task.completed else 'reopened')
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
    task = get_team_resource_or_404(Task, task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    if g.get('current_role') not in ('manager', 'super_admin'):
        return jsonify({"error": "Only admins can delete tasks"}), 403

    project = task.project_record
    task_recipients = task_email_users(task)
    task_snapshot = task.to_dict()
    prepare_task_for_delete(task)
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

    task = get_team_resource_or_404(Task, task_id)
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
        team_id=task.team_id,
        author=user.username,
        text=validated.get("text", "")
    )
    db.session.add(comment)
    mentioned_usernames = extract_mentions(comment.text)
    mentioned_users = User.query.filter(
        User.username.in_(mentioned_usernames),
        User.team_id == g.get('current_team_id'),
    ).all() if mentioned_usernames else []
    mentioned_names = [mentioned.username for mentioned in mentioned_users]
    log = ActivityLog(
        user_id=user_id,
        task_id=task_id,
        team_id=task.team_id,
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
            team_id=task.team_id,
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
    task = get_team_resource_or_404(Task, task_id)
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

    task = get_team_resource_or_404(Task, task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    if not user_can_access_task(user, task):
        return jsonify({"error": "Permission denied"}), 403
    if g.get('current_role') not in ('manager', 'super_admin'):
        return jsonify({"error": "Tylko administrator może zarządzać podzadaniami"}), 403

    data = request.get_json()
    schema = SubtaskSchema()
    try:
        validated = schema.load(data)
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    subtask = Subtask(
        task_id=task_id,
        team_id=task.team_id,
        title=validated.get("title", "Subtask")
    )
    db.session.add(subtask)

    log = ActivityLog(user_id=user_id, task_id=task_id, team_id=task.team_id, action='subtask_created', details={'title': subtask.title})
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
    if not subtask or subtask.team_id != g.get('current_team_id'):
        return jsonify({"error": "Subtask not found"}), 404

    task = get_team_resource_or_404(Task, subtask.task_id)
    if not user_can_access_task(user, task):
        return jsonify({"error": "Permission denied"}), 403

    subtask.completed = not subtask.completed

    log = ActivityLog(user_id=user_id, task_id=task.id, team_id=task.team_id, action='subtask_toggle', details={'subtask': subtask.title, 'completed': subtask.completed})
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
    if not subtask or subtask.team_id != g.get('current_team_id'):
        return jsonify({"error": "Subtask not found"}), 404

    task = get_team_resource_or_404(Task, subtask.task_id)
    if not user_can_access_task(user, task):
        return jsonify({"error": "Permission denied"}), 403
    if g.get('current_role') not in ('manager', 'super_admin'):
        return jsonify({"error": "Tylko administrator może zarządzać podzadaniami"}), 403

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

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 500, type=int)
    per_page = min(max(per_page, 1), 1000)

    query = visible_task_query(user)

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

    total = query.count()
    tasks = query.options(*_eager_task_options()).offset((page - 1) * per_page).limit(per_page).all()
    return jsonify({
        "tasks": [t.to_dict() for t in tasks],
        "total": total,
        "page": page,
        "per_page": per_page,
    })

@tasks_bp.route('/tasks/by-project', methods=['GET'])
@login_required
def tasks_by_project():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    limit = request.args.get('limit', 500, type=int)
    limit = min(max(limit, 1), 1000)

    tasks = visible_task_query(user).options(*_eager_task_options()).limit(limit).all()

    projects = {}
    if g.get('current_role') in ('manager', 'super_admin'):
        for project in team_scoped(Project.query, Project).order_by(Project.name.asc()).all():
            projects[project.name] = []
    for task in tasks:
        proj = task.project
        if proj not in projects:
            projects[proj] = []
        projects[proj].append(task.to_dict())
    return jsonify(projects)

@tasks_bp.route('/tasks/search', methods=['GET'])
@login_required
def search_tasks():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    query_str = request.args.get('q', '').strip()

    if not query_str:
        return jsonify({'tasks': [], 'total': 0})

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    per_page = min(max(per_page, 1), 200)

    query = visible_task_query(user).filter(
        (Task.title.ilike(f'%{query_str}%')) | (Task.notes.ilike(f'%{query_str}%'))
    )

    total = query.count()
    tasks = query.options(*_eager_task_options()).offset((page - 1) * per_page).limit(per_page).all()

    return jsonify({
        'tasks': [t.to_dict() for t in tasks],
        'total': total,
        'page': page,
        'per_page': per_page,
    })

@tasks_bp.route('/tasks/<int:task_id>/tags/<int:tag_id>', methods=['POST', 'DELETE'])
@login_required
def manage_task_tags(task_id, tag_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    task = get_team_resource_or_404(Task, task_id)
    tag = db.session.get(Tag, tag_id)
    if not task or not tag or tag.team_id != g.get('current_team_id'):
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

    if g.get('current_role') not in ('manager', 'super_admin'):
        return jsonify({"error": "Tylko administrator może edytować masowo"}), 403

    data = request.get_json()
    task_ids = data.get('task_ids', [])

    if len(task_ids) > BULK_MAX_TASKS:
        return jsonify({"error": f"Maksymalna liczba zadań w operacji masowej: {BULK_MAX_TASKS}"}), 400

    tasks = bulk_scoped_tasks_or_error(task_ids)
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

    if g.get('current_role') not in ('manager', 'super_admin'):
        return jsonify({"error": "Tylko administrator może usuwać masowo"}), 403

    data = request.get_json()
    task_ids = data.get('task_ids', [])

    if len(task_ids) > BULK_MAX_TASKS:
        return jsonify({"error": f"Maksymalna liczba zadań w operacji masowej: {BULK_MAX_TASKS}"}), 400

    tasks = bulk_scoped_tasks_or_error(task_ids)

    count = len(tasks)
    for task in tasks:
        prepare_task_for_delete(task)
        db.session.delete(task)

    db.session.commit()
    emit_task_event("bulk_deleted", user, task_ids=task_ids)
    return jsonify({"message": f"Usunięto {count} zadań"}), 200

@tasks_bp.route('/tasks/export', methods=['GET'])
@login_required
def export_tasks():
    """Export all tasks for the current team as JSON."""
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if g.get('current_role') not in ('manager', 'super_admin'):
        return jsonify({"error": "Tylko administrator może eksportować zadania"}), 403

    tasks = visible_task_query(user).options(*_eager_task_options()).all()
    projects = team_scoped(Project.query, Project).all()

    export_data = {
        "version": "1.0",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "team_id": g.get('current_team_id'),
        "projects": [project.to_dict(include_tasks=False) for project in projects],
        "tasks": [task.to_dict() for task in tasks],
    }
    return jsonify(export_data)


@tasks_bp.route('/tasks/import', methods=['POST'])
@login_required
def import_tasks():
    """Import tasks from a JSON export."""
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if g.get('current_role') not in ('manager', 'super_admin'):
        return jsonify({"error": "Tylko administrator może importować zadania"}), 403

    data = request.get_json()
    if not data or 'tasks' not in data:
        return jsonify({"error": "Nieprawidłowy format danych. Wymagane pole: tasks"}), 400

    imported_count = 0
    errors = []

    # Pre-create projects from the export if they don't exist
    if 'projects' in data:
        for proj_data in data['projects']:
            existing = team_scoped(Project.query, Project).filter_by(name=proj_data['name']).first()
            if not existing:
                project = Project(
                    name=proj_data['name'],
                    description=proj_data.get('description', ''),
                    color=proj_data.get('color', '#3b82f6'),
                    team_id=g.get('current_team_id'),
                    created_by_id=user_id,
                )
                db.session.add(project)

    for task_data in data['tasks']:
        try:
            title = task_data.get('title', '').strip()
            if not title:
                errors.append({"title": "(brak)", "error": "Pominięto zadanie bez tytułu"})
                continue

            due_date = parse_due_date(task_data.get('due_date')) if task_data.get('due_date') else None

            project, project_error = resolve_project(None, task_data.get('project', 'Ogólny'), user)
            if project_error:
                errors.append({"title": title, "error": str(project_error[0])})
                continue

            task = Task(
                user_id=user_id,
                title=title,
                priority=task_data.get('priority', 'medium'),
                project=project.name,
                project_id=project.id,
                due_date=due_date,
                notes=task_data.get('notes', ''),
                team_id=g.get('current_team_id'),
            )
            db.session.add(task)
            imported_count += 1
        except Exception as exc:
            errors.append({"title": task_data.get('title', '(unknown)'), "error": str(exc)})

    if imported_count > 0:
        db.session.commit()
        emit_task_event("tasks_imported", user, extra={"count": imported_count})

    return jsonify({
        "imported": imported_count,
        "errors": errors,
        "message": f"Zaimportowano {imported_count} zadań" + (f", {len(errors)} błędów" if errors else ""),
    }), 201 if imported_count > 0 else 400


@tasks_bp.route('/tasks/bulk/update', methods=['PUT'])
@login_required
def bulk_update_tasks():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if g.get('current_role') not in ('manager', 'super_admin'):
        return jsonify({"error": "Tylko administrator może edytować masowo"}), 403

    data = request.get_json()
    task_ids = data.get('task_ids', [])
    updates_raw = data.get('updates', {})

    schema = TaskSchema(partial=True)
    try:
        updates = schema.load(updates_raw)
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    if len(task_ids) > BULK_MAX_TASKS:
        return jsonify({"error": f"Maksymalna liczba zadań w operacji masowej: {BULK_MAX_TASKS}"}), 400

    tasks = bulk_scoped_tasks_or_error(task_ids)
    marks_done = updates.get('completed') is True or updates.get('status') == 'done'
    blocked_tasks = [task for task in tasks if marks_done and not task_is_done(task) and task_blocks_completion(task)]
    if blocked_tasks:
        return jsonify({
            "error": "Nie można zakończyć zadań, które mają otwarte zależności lub podzadania.",
            "blocked_tasks": [task.summary_dict() for task in blocked_tasks],
        }), 409

    for task in tasks:
        for key, value in updates.items():
            if key == 'assignees':
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
                setattr(task, key, value)

    db.session.commit()
    emit_task_event("bulk_updated", user, task_ids=task_ids)
    return jsonify({"message": f"Zaktualizowano {len(task_ids)} zadań"}), 200
