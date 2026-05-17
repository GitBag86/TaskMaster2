from flask import request, jsonify, session, url_for, current_app
from datetime import datetime, timezone
from marshmallow import ValidationError
from extensions import socketio
from routes import tasks_bp
from models import db, User, Task, Comment, Subtask, ActivityLog, Tag
from schemas import TaskSchema, CommentSchema, SubtaskSchema
from routes.auth import login_required
from utils.email_sender import send_email, get_task_status_change_body, get_task_assignment_body

TASK_ALLOWED_FIELDS = {'title', 'priority', 'project', 'due_date', 'notes', 'completed', 'status'}
BULK_MAX_TASKS = 100

def emit_task_event(action, user, task=None, task_ids=None, task_id=None, task_payload=None):
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
    socketio.emit("task_action", payload)

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

def assigned_task_query(user):
    return Task.query.filter(Task.assignees.any(User.id == user.id))

def assignee_names(task):
    return ', '.join(user.username for user in task.assignees)

def update_task_assignees(task, assignee_ids):
    users = User.query.filter(User.id.in_(assignee_ids)).all() if assignee_ids else []
    task.assignees = users
    return users

@tasks_bp.route('/tasks', methods=['GET'])
@login_required
def get_tasks():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    per_page = min(per_page, 100)

    if user.role == 'admin':
        query = Task.query
    else:
        query = assigned_task_query(user)

    pagination = query.order_by(Task.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)
    tasks = pagination.items

    return jsonify({
        "tasks": [t.to_dict() for t in tasks],
        "total": pagination.total,
        "page": pagination.page,
        "pages": pagination.pages,
        "per_page": pagination.per_page
    })

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

    task = Task(
        user_id=user_id,
        title=validated.get("title", "Untitled"),
        priority=validated.get("priority", "medium"),
        project=validated.get("project", "General"),
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
    db.session.commit()

    emit_task_event("created", user, task=task)

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

    old_status = task.status
    old_assignee_ids = {assignee.id for assignee in task.assignees}

    data = request.get_json()
    for key, value in data.items():
        if key in ('assignee_ids', 'assignees'):
            update_task_assignees(task, value or [])
        elif key in TASK_ALLOWED_FIELDS and hasattr(task, key):
            if key == 'due_date':
                value = parse_due_date(value)
            setattr(task, key, value)

    db.session.commit()

    task_link = url_for('index', _external=True) + f'tasks/{task.id}' # Assuming tasks are viewed at /tasks/{id}

    # Send email for status change
    if 'status' in data and old_status != task.status:
        if task.owner and task.owner.email:
            subject = f"Zmiana statusu zadania: {task.title}"
            body = get_task_status_change_body(task.title, old_status, task.status, task_link)
            send_email(task.owner.email, subject, body)

    # Send email for new assignments
    if 'assignee_ids' in data or 'assignees' in data:
        for assignee_user in task.assignees:
            if assignee_user.id in old_assignee_ids or not assignee_user.email:
                continue
            subject = f"Zostałeś przypisany do zadania: {task.title}"
            body = get_task_assignment_body(task.title, assignee_user.username, task_link)
            send_email(assignee_user.email, subject, body)

    emit_task_event("updated", user, task=task)

    log = ActivityLog(user_id=user_id, task_id=task_id, action='updated', details={'title': task.title})
    db.session.add(log)
    db.session.commit()

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

    task.completed = not task.completed
    task.status = 'done' if task.completed else 'todo'

    log = ActivityLog(user_id=user_id, task_id=task_id, action='completed' if task.completed else 'reopened')
    db.session.add(log)
    db.session.commit()

    emit_task_event("completed" if task.completed else "reopened", user, task=task)

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

    task_snapshot = task.to_dict()
    db.session.delete(task)
    db.session.commit()

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
    db.session.commit()

    emit_task_event("commented", user, task=task)
    return jsonify(comment.to_dict()), 201

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

    if user.role == 'admin':
        tasks = Task.query.all()
    else:
        tasks = assigned_task_query(user).all()

    projects = {}
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
    task = db.session.get(Task, task_id)
    tag = db.session.get(Tag, tag_id)
    if not task or not tag:
        return jsonify({"error": "Not found"}), 404

    if request.method == 'POST':
        if tag not in task.tags:
            task.tags.append(tag)
    else:
        if tag in task.tags:
            task.tags.remove(tag)

    db.session.commit()
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

    for task_id in task_ids:
        task = db.session.get(Task, task_id)
        if task:
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

    for task_id in task_ids:
        task = db.session.get(Task, task_id)
        if task:
            for key, value in updates.items():
                if key in ('assignee_ids', 'assignees'):
                    update_task_assignees(task, value or [])
                elif key in TASK_ALLOWED_FIELDS and hasattr(task, key):
                    if key == 'due_date':
                        value = parse_due_date(value)
                    setattr(task, key, value)

    db.session.commit()
    emit_task_event("bulk_updated", user, task_ids=task_ids)
    return jsonify({"message": f"Zaktualizowano {len(task_ids)} zadań"}), 200
