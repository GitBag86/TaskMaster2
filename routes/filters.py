from flask import request, jsonify, session
from datetime import datetime, timezone
from marshmallow import ValidationError
from extensions import socketio
from routes import filters_bp
from models import db, User, Task, Tag, SavedFilter, TaskTemplate, CustomField, Project, ActivityLog
from schemas import TagSchema, FilterSchema, TemplateSchema, CustomFieldSchema
from routes.auth import login_required
from utils.socket_rooms import task_recipient_ids, user_room
from utils.task_visibility import serialize_task_for_user, user_can_access_task


def emit_task_event(action, user, task):
    payload = {
        "action": action,
        "user": user.username,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "task_id": task.id,
    }
    for recipient_id in sorted(task_recipient_ids(task, actor=user)):
        recipient = db.session.get(User, recipient_id)
        socketio.emit(
            "task_action",
            {**payload, "task": serialize_task_for_user(task, recipient)},
            to=user_room(recipient_id),
        )


def get_or_create_project(name, user):
    project_name = (name or 'Ogólny').strip() or 'Ogólny'
    project = Project.query.filter_by(name=project_name).first()
    if project:
        return project
    project = Project(name=project_name, created_by_id=user.id)
    db.session.add(project)
    db.session.flush()
    return project

# --- Tags ---

@filters_bp.route('/tags', methods=['GET', 'POST'])
@login_required
def manage_tags():
    user_id = session.get('user_id')

    if request.method == 'GET':
        tags = Tag.query.filter_by(user_id=user_id).all()
        return jsonify({'tags': [t.to_dict() for t in tags]})

    data = request.get_json()
    schema = TagSchema()
    try:
        validated = schema.load(data)
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    tag = Tag(user_id=user_id, name=validated['name'], color=validated.get('color', '#667eea'))
    db.session.add(tag)
    db.session.commit()
    return jsonify(tag.to_dict()), 201

@filters_bp.route('/tags/<int:tag_id>', methods=['DELETE'])
@login_required
def delete_tag(tag_id):
    tag = db.session.get(Tag, tag_id)
    if not tag or tag.user_id != session.get('user_id'):
        return jsonify({"error": "Not found"}), 404
    db.session.delete(tag)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200

# --- Saved Filters ---

@filters_bp.route('/filters', methods=['GET', 'POST'])
@login_required
def manage_filters():
    user_id = session.get('user_id')

    if request.method == 'GET':
        filters = SavedFilter.query.filter_by(user_id=user_id).all()
        return jsonify({'filters': [f.to_dict() for f in filters]})

    data = request.get_json()
    schema = FilterSchema()
    try:
        validated = schema.load(data)
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    filter_obj = SavedFilter(user_id=user_id, name=validated['name'], filters=validated['filters'])
    db.session.add(filter_obj)
    db.session.commit()
    return jsonify(filter_obj.to_dict()), 201

@filters_bp.route('/filters/<int:filter_id>', methods=['DELETE'])
@login_required
def delete_filter(filter_id):
    filter_obj = db.session.get(SavedFilter, filter_id)
    if not filter_obj or filter_obj.user_id != session.get('user_id'):
        return jsonify({"error": "Not found"}), 404
    db.session.delete(filter_obj)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200

# --- Templates ---

@filters_bp.route('/templates', methods=['GET', 'POST'])
@login_required
def manage_templates():
    user_id = session.get('user_id')

    if request.method == 'GET':
        templates = TaskTemplate.query.filter_by(user_id=user_id).all()
        return jsonify({'templates': [t.to_dict() for t in templates]})

    data = request.get_json()
    schema = TemplateSchema()
    try:
        validated = schema.load(data)
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    template = TaskTemplate(
        user_id=user_id,
        name=validated['name'],
        description=validated.get('description'),
        template_data=validated['template_data']
    )
    db.session.add(template)
    db.session.commit()
    return jsonify(template.to_dict()), 201

@filters_bp.route('/templates/<int:template_id>', methods=['DELETE'])
@login_required
def delete_template(template_id):
    template = db.session.get(TaskTemplate, template_id)
    if not template or template.user_id != session.get('user_id'):
        return jsonify({"error": "Not found"}), 404
    db.session.delete(template)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200

@filters_bp.route('/templates/<int:template_id>/use', methods=['POST'])
@login_required
def use_template(template_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if user.role != 'admin':
        return jsonify({"error": "Only admins can create tasks"}), 403

    template = db.session.get(TaskTemplate, template_id)
    if not template:
        return jsonify({"error": "Template not found"}), 404
    if template.user_id != user_id:
        return jsonify({"error": "Template not found"}), 404

    data = template.template_data or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({"error": "Template does not contain a task title"}), 400

    project = get_or_create_project(data.get('project'), user)
    task = Task(
        user_id=user_id,
        title=title,
        priority=data.get('priority', 'medium'),
        project=project.name,
        project_id=project.id,
        notes=data.get('notes', '')
    )
    assignee_ids = data.get('assignee_ids', [])
    if assignee_ids:
        task.assignees = User.query.filter(User.id.in_(assignee_ids[:1])).all()
    db.session.add(task)
    db.session.flush()
    db.session.add(ActivityLog(user_id=user_id, task_id=task.id, action='created', details={'title': task.title, 'source': 'task_template'}))
    db.session.commit()
    emit_task_event("created", user, task)
    return jsonify(serialize_task_for_user(task, user)), 201

# --- Custom Fields ---

@filters_bp.route('/tasks/<int:task_id>/fields', methods=['POST'])
@login_required
def add_custom_field(task_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    task = db.session.get(Task, task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    if not user_can_access_task(user, task):
        return jsonify({"error": "Permission denied"}), 403

    data = request.get_json()
    schema = CustomFieldSchema()
    try:
        validated = schema.load(data)
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    field = CustomField(
        user_id=user_id,
        task_id=task_id,
        field_name=validated['field_name'],
        field_value=validated.get('field_value')
    )
    db.session.add(field)
    db.session.commit()
    emit_task_event("custom_field_added", user, task)
    return jsonify(field.to_dict()), 201
