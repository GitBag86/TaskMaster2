from flask import g, request, jsonify, session
from marshmallow import ValidationError
from routes import filters_bp
from models import db, User, Task, Tag, SavedFilter, TaskTemplate, CustomField
from schemas import TagSchema, FilterSchema, TemplateSchema, CustomFieldSchema
from routes.auth import login_required
from utils.errors import CrossTeamReferenceError
from utils.scoping import get_team_resource_or_404, team_scoped

# --- Tags ---

@filters_bp.route('/tags', methods=['GET', 'POST'])
@login_required
def manage_tags():
    user_id = session.get('user_id')

    if request.method == 'GET':
        tags = team_scoped(Tag.query, Tag).order_by(Tag.name.asc()).all()
        return jsonify({'tags': [t.to_dict() for t in tags]})

    data = request.get_json()
    schema = TagSchema()
    try:
        validated = schema.load(data)
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    tag = Tag(
        user_id=user_id,
        team_id=g.get('current_team_id'),
        name=validated['name'],
        color=validated.get('color', '#667eea'),
    )
    db.session.add(tag)
    db.session.commit()
    return jsonify(tag.to_dict()), 201

@filters_bp.route('/tags/<int:tag_id>', methods=['DELETE'])
@login_required
def delete_tag(tag_id):
    tag = db.session.get(Tag, tag_id)
    if not tag or tag.team_id != g.get('current_team_id') or tag.user_id != session.get('user_id'):
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
        filters = team_scoped(SavedFilter.query, SavedFilter).filter_by(user_id=user_id).all()
        return jsonify({'filters': [f.to_dict() for f in filters]})

    data = request.get_json()
    schema = FilterSchema()
    try:
        validated = schema.load(data)
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    filter_obj = SavedFilter(
        user_id=user_id,
        team_id=g.get('current_team_id'),
        name=validated['name'],
        filters=validated['filters'],
    )
    db.session.add(filter_obj)
    db.session.commit()
    return jsonify(filter_obj.to_dict()), 201

@filters_bp.route('/filters/<int:filter_id>', methods=['DELETE'])
@login_required
def delete_filter(filter_id):
    filter_obj = db.session.get(SavedFilter, filter_id)
    if (
        not filter_obj
        or filter_obj.team_id != g.get('current_team_id')
        or filter_obj.user_id != session.get('user_id')
    ):
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
        templates = team_scoped(TaskTemplate.query, TaskTemplate).filter_by(user_id=user_id).all()
        return jsonify({'templates': [t.to_dict() for t in templates]})

    data = request.get_json()
    schema = TemplateSchema()
    try:
        validated = schema.load(data)
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    template = TaskTemplate(
        user_id=user_id,
        team_id=g.get('current_team_id'),
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
    if (
        not template
        or template.team_id != g.get('current_team_id')
        or template.user_id != session.get('user_id')
    ):
        return jsonify({"error": "Not found"}), 404
    db.session.delete(template)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200

@filters_bp.route('/templates/<int:template_id>/use', methods=['POST'])
@login_required
def use_template(template_id):
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if g.get('current_role') not in ('manager', 'super_admin'):
        return jsonify({"error": "Only admins can create tasks"}), 403

    template = get_team_resource_or_404(TaskTemplate, template_id)
    if not template:
        return jsonify({"error": "Template not found"}), 404

    data = template.template_data
    task = Task(
        user_id=user_id,
        team_id=g.get('current_team_id'),
        title=data.get('title'),
        priority=data.get('priority', 'medium'),
        project=data.get('project', 'General'),
        notes=data.get('notes', '')
    )
    assignee_ids = data.get('assignee_ids', [])
    if assignee_ids:
        assignees = User.query.filter(User.id.in_(assignee_ids[:1])).all()
        if len(assignees) != len(set(assignee_ids[:1])) or any(
            assignee.team_id != g.get('current_team_id') for assignee in assignees
        ):
            raise CrossTeamReferenceError()
        task.assignees = assignees
    db.session.add(task)
    db.session.commit()
    return jsonify(task.to_dict()), 201

# --- Custom Fields ---

@filters_bp.route('/tasks/<int:task_id>/fields', methods=['POST'])
@login_required
def add_custom_field(task_id):
    task = get_team_resource_or_404(Task, task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    data = request.get_json()
    schema = CustomFieldSchema()
    try:
        validated = schema.load(data)
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    field = CustomField(
        user_id=session.get('user_id'),
        task_id=task_id,
        team_id=task.team_id,
        field_name=validated['field_name'],
        field_value=validated.get('field_value')
    )
    db.session.add(field)
    db.session.commit()
    return jsonify(field.to_dict()), 201
