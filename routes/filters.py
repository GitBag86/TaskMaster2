from flask import request, jsonify, session
from marshmallow import ValidationError
from routes import filters_bp
from models import db, User, Task, Tag, SavedFilter, TaskTemplate, TaskDependency, CustomField
from schemas import TagSchema, FilterSchema, TemplateSchema, DependencySchema, CustomFieldSchema
from routes.auth import login_required

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

    data = template.template_data
    task = Task(
        user_id=user_id,
        title=data.get('title'),
        assigned_to=data.get('assigned_to', 'Unassigned'),
        priority=data.get('priority', 'medium'),
        project=data.get('project', 'General'),
        notes=data.get('notes', '')
    )
    db.session.add(task)
    db.session.commit()
    return jsonify(task.to_dict()), 201

# --- Dependencies ---

@filters_bp.route('/tasks/<int:task_id>/dependencies', methods=['GET', 'POST'])
@login_required
def manage_dependencies(task_id):
    task = db.session.get(Task, task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    if request.method == 'GET':
        deps = TaskDependency.query.filter_by(task_id=task_id).all()
        return jsonify({'dependencies': [d.to_dict() for d in deps]})

    data = request.get_json()
    schema = DependencySchema()
    try:
        validated = schema.load(data)
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    dep = TaskDependency(task_id=task_id, depends_on_task_id=validated['depends_on_task_id'])
    db.session.add(dep)
    db.session.commit()
    return jsonify(dep.to_dict()), 201

@filters_bp.route('/dependencies/<int:dep_id>', methods=['DELETE'])
@login_required
def delete_dependency(dep_id):
    dep = db.session.get(TaskDependency, dep_id)
    if not dep:
        return jsonify({"error": "Not found"}), 404
    db.session.delete(dep)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200

# --- Custom Fields ---

@filters_bp.route('/tasks/<int:task_id>/fields', methods=['POST'])
@login_required
def add_custom_field(task_id):
    task = db.session.get(Task, task_id)
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
        field_name=validated['field_name'],
        field_value=validated.get('field_value')
    )
    db.session.add(field)
    db.session.commit()
    return jsonify(field.to_dict()), 201
