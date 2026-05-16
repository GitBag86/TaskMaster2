from flask import Flask, request, jsonify, send_file, session
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_socketio import SocketIO, emit
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import os
from dotenv import load_dotenv
load_dotenv()

import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from schemas import UserSchema, TaskSchema, CommentSchema, SubtaskSchema, LoginSchema, SignupSchema
from marshmallow import ValidationError

app = Flask(__name__)
# Ensure the instance folder exists
os.makedirs(app.instance_path, exist_ok=True)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(app.instance_path, 'tasks.db')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-key-change-in-production')
CORS(app, supports_credentials=True)

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Auth decorators
from functools import wraps

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({"error": "Nie jesteś zalogowany"}), 401
        return f(*args, **kwargs)
    return decorated_function

def validate_user_role(allowed_roles=None):
    allowed_roles = allowed_roles or ['admin']
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user_id = session.get('user_id')
            if not user_id:
                return jsonify({"error": "Nie jesteś zalogowany"}), 401
            user = User.query.get(user_id)
            if user.role not in allowed_roles:
                return jsonify({"error": "Brak uprawnień"}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def log_route(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        logger.info(f"Entering {f.__name__}")
        try:
            result = f(*args, **kwargs)
        finally:
            logger.info(f"Exiting {f.__name__}")
        return result
    return decorated

logger.info("App initialized")

@app.before_request
def log_request():
    logger.info(f"Request: {request.method} {request.path}")

db = SQLAlchemy(app)
migrate = Migrate(app, db)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(100), unique=True)
    role = db.Column(db.String(20), default='user')  # 'user' or 'admin'
    tasks = db.relationship('Task', backref='owner', lazy=True, cascade='all, delete-orphan')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, password):
        self.password = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password, password)

    def to_dict(self):
        return {'id': self.id, 'username': self.username, 'email': self.email, 'role': self.role}

class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    assigned_to = db.Column(db.String(100), default='Nieprzypisane')
    priority = db.Column(db.String(20), default='medium')
    project = db.Column(db.String(100), default='Ogólny')
    due_date = db.Column(db.String(20), default='')
    notes = db.Column(db.Text, default='')
    completed = db.Column(db.Boolean, default=False)
    status = db.Column(db.String(20), default='todo') # todo, in_progress, done
    comments = db.relationship('Comment', backref='task', lazy=True, cascade='all, delete-orphan')
    subtasks = db.relationship('Subtask', backref='task', lazy=True, cascade='all, delete-orphan')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'assigned_to': self.assigned_to,
            'priority': self.priority,
            'project': self.project,
            'due_date': self.due_date,
            'notes': self.notes,
            'completed': self.completed,
            'status': self.status,
            'comments': [c.to_dict() for c in self.comments],
            'subtasks': [s.to_dict() for s in self.subtasks],
            'created_at': self.created_at.isoformat()
        }

class Comment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)
    author = db.Column(db.String(100), default='Anonimowy')
    text = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'author': self.author,
            'text': self.text
        }

class Subtask(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    completed = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'task_id': self.task_id,
            'title': self.title,
            'completed': self.completed
        }

class Tag(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(50), nullable=False)
    color = db.Column(db.String(7), default='#667eea')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'color': self.color}

task_tags = db.Table('task_tags', 
    db.Column('task_id', db.Integer, db.ForeignKey('task.id'), primary_key=True),
    db.Column('tag_id', db.Integer, db.ForeignKey('tag.id'), primary_key=True)
)

class SavedFilter(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    filters = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'filters': self.filters}

class ActivityLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'))
    action = db.Column(db.String(50), nullable=False)  # created, updated, completed, deleted, commented
    details = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'task_id': self.task_id,
            'action': self.action,
            'details': self.details,
            'created_at': self.created_at.isoformat()
        }

class RecurringTask(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)
    frequency = db.Column(db.String(20), nullable=False)  # daily, weekly, monthly
    interval = db.Column(db.Integer, default=1)
    end_date = db.Column(db.String(20))
    last_generated = db.Column(db.DateTime, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'task_id': self.task_id,
            'frequency': self.frequency,
            'interval': self.interval,
            'end_date': self.end_date
        }

class TaskTemplate(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.String(500))
    template_data = db.Column(db.JSON, nullable=False)  # stores title, priority, project, etc
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'template_data': self.template_data
        }

class TaskDependency(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)
    depends_on_task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'task_id': self.task_id,
            'depends_on_task_id': self.depends_on_task_id
        }

class CustomField(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)
    field_name = db.Column(db.String(100), nullable=False)
    field_value = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'field_name': self.field_name,
            'field_value': self.field_value
        }

Task.tags = db.relationship('Tag', secondary=task_tags, lazy='dynamic')
Task.dependencies = db.relationship('TaskDependency', 
    foreign_keys='TaskDependency.task_id',
    backref='task',
    cascade='all, delete-orphan',
    lazy=True
)
Task.custom_fields = db.relationship('CustomField', backref='task', cascade='all, delete-orphan', lazy=True)

with app.app_context():
    db.create_all()

@app.route('/')
def index():
    return send_file('index.html')

@app.route('/manifest.json')
def manifest():
    return send_file('manifest.json')

@app.route('/sw.js')
def sw():
    return send_file('sw.js')

@app.route('/health')
def health():
    return jsonify({'status': 'healthy'}), 200

@app.route('/auth/signup', methods=['POST'])
def signup():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"error": "Nazwa użytkownika i hasło są wymagane"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Użytkownik już istnieje"}), 400

    is_first_user = User.query.first() is None
    user = User(username=username, email=data.get('email', ''), role='admin' if is_first_user else 'user')
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    session['user_id'] = user.id
    return jsonify({"message": "Rejestracja pomyślna", "user": user.to_dict()}), 201

@app.route('/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Błędne dane logowania"}), 401

    session['user_id'] = user.id
    return jsonify({"message": "Logowanie pomyślne", "user": user.to_dict()})

@app.route('/auth/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    return jsonify({"message": "Wylogowano"})

@app.route('/auth/me', methods=['GET'])
def get_current_user():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Nie jesteś zalogowany"}), 401

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "Użytkownik nie znaleziony"}), 404

    return jsonify(user.to_dict())

@app.route('/users', methods=['GET'])
@login_required
def get_users():
    user_id = session.get('user_id')
    user = User.query.get(user_id)
    
    if user.role != 'admin':
        return jsonify({"error": "Tylko administrator może przeglądać użytkowników"}), 403
    
    users = User.query.all()
    return jsonify({"users": [u.to_dict() for u in users]})

@app.route('/users/<int:target_user_id>/role', methods=['PUT'])
@login_required
def update_user_role(target_user_id):
    user_id = session.get('user_id')
    user = User.query.get(user_id)
    
    if user.role != 'admin':
        return jsonify({"error": "Tylko administrator może zmieniać role"}), 403
    
    target_user = User.query.get(target_user_id)
    if not target_user:
        return jsonify({"error": "Użytkownik nie znaleziony"}), 404
    
    data = request.get_json()
    new_role = data.get('role')
    if new_role not in ['user', 'admin']:
        return jsonify({"error": "Nieprawidłowa rola"}), 400
    
    target_user.role = new_role
    db.session.commit()
    
    return jsonify({"message": f"Zmieniono rolę użytkownika {target_user.username} na {new_role}"}), 200

@app.route('/tasks', methods=['GET'])
@login_required
def get_tasks():
    user_id = session.get('user_id')
    user = User.query.get(user_id)

    if user.role == 'admin':
        tasks = Task.query.all()
    else:
        tasks = Task.query.filter_by(assigned_to=user.username).all()

    return jsonify({"tasks": [t.to_dict() for t in tasks]})

@app.route('/tasks', methods=['POST'])
@login_required
def create_task():
    user_id = session.get('user_id')
    user = User.query.get(user_id)
    
    if user.role != 'admin':
        return jsonify({"error": "Tylko administrator może tworzyć zadania"}), 403

    data = request.get_json()
    task = Task(
        user_id=user_id,
        title=data.get("title", "Untitled"),
        assigned_to=data.get("assigned_to", "Unassigned"),
        priority=data.get("priority", "medium"),
        project=data.get("project", "General"),
        due_date=data.get("due_date", ""),
        notes=data.get("notes", "")
    )
    db.session.add(task)
    db.session.commit()
    
    socketio.emit('task_action', {'action': 'utworzył(a)', 'task': task.title, 'user': user.username}, broadcast=True)
    return jsonify(task.to_dict()), 201

@app.route('/tasks/<int:task_id>', methods=['PUT'])
@login_required
def update_task(task_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Not logged in"}), 401

    user = User.query.get(user_id)
    task = Task.query.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    if user.role != 'admin':
        return jsonify({"error": "Only admins can update tasks"}), 403

    data = request.get_json()
    for key, value in data.items():
        if key != 'id' and key != 'user_id' and hasattr(task, key):
            setattr(task, key, value)
    db.session.commit()
    
    socketio.emit('task_action', {'action': 'zaktualizował(a)', 'task': task.title, 'user': user.username}, broadcast=True)
    return jsonify(task.to_dict())

@app.route('/tasks/<int:task_id>/complete', methods=['PUT'])
@login_required
def complete_task(task_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Not logged in"}), 401

    task = Task.query.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    user = User.query.get(user_id)
    if user.role == 'user' and task.assigned_to != user.username:
        return jsonify({"error": "Can only complete tasks assigned to you"}), 403

    task.completed = True
    db.session.commit()
    
    action = 'ukończył(a)' if task.completed else 'przywrócił(a)'
    socketio.emit('task_action', {'action': action, 'task': task.title, 'user': user.username}, broadcast=True)
    return jsonify(task.to_dict())

@app.route('/tasks/<int:task_id>', methods=['DELETE'])
@login_required
def delete_task(task_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Not logged in"}), 401

    user = User.query.get(user_id)
    task = Task.query.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    if user.role != 'admin':
        return jsonify({"error": "Only admins can delete tasks"}), 403

    task_title = task.title
    db.session.delete(task)
    db.session.commit()
    
    socketio.emit('task_action', {'action': 'usunął(ęła)', 'task': task_title, 'user': user.username}, broadcast=True)
    return jsonify({"message": "Zadanie usunięte"}), 200

@app.route('/tasks/<int:task_id>/comments', methods=['POST'])
@login_required
def add_comment(task_id):
    task = Task.query.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    data = request.get_json()
    comment = Comment(
        task_id=task_id,
        author=data.get("author", "Anonymous"),
        text=data.get("text", "")
    )
    db.session.add(comment)
    db.session.commit()
    
    socketio.emit('task_action', {'action': 'skomentował(a)', 'task': task.title, 'user': User.username}, broadcast=True)
    return jsonify(comment.to_dict()), 201

@app.route('/tasks/<int:task_id>/subtasks', methods=['POST'])
def add_subtask(task_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Not logged in"}), 401

    task = Task.query.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    user = User.query.get(user_id)
    if user.role != 'admin' and task.assigned_to != user.username:
        return jsonify({"error": "Permission denied"}), 403

    data = request.get_json()
    subtask = Subtask(
        task_id=task_id,
        title=data.get("title", "Subtask")
    )
    db.session.add(subtask)
    db.session.commit()
    return jsonify(subtask.to_dict()), 201

@app.route('/subtasks/<int:subtask_id>/complete', methods=['PUT'])
def complete_subtask(subtask_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Not logged in"}), 401

    subtask = Subtask.query.get(subtask_id)
    if not subtask:
        return jsonify({"error": "Subtask not found"}), 404

    subtask.completed = not subtask.completed
    db.session.commit()
    
    action = 'ukończył(a)' if subtask.completed else 'przywrócił(a)'
    socketio.emit('task_action', {'action': action, 'task': subtask.title, 'user': User.username}, broadcast=True)
    return jsonify(subtask.to_dict())

@app.route('/subtasks/<int:subtask_id>', methods=['DELETE'])
def delete_subtask(subtask_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Not logged in"}), 401

    subtask = Subtask.query.get(subtask_id)
    if not subtask:
        return jsonify({"error": "Subtask not found"}), 404

    db.session.delete(subtask)
    db.session.commit()
    return jsonify({"message": "Subtask deleted"}), 200

@app.route('/tasks/filter', methods=['GET'])
@login_required
def filter_tasks():
    query = Task.query

    assigned_to = request.args.get('assigned_to')
    priority = request.args.get('priority')
    project = request.args.get('project')
    completed = request.args.get('completed')

    if assigned_to:
        query = query.filter_by(assigned_to=assigned_to)
    if priority:
        query = query.filter_by(priority=priority)
    if project:
        query = query.filter_by(project=project)
    if completed:
        query = query.filter_by(completed=(completed.lower() == 'true'))

    tasks = query.all()
    return jsonify({"tasks": [t.to_dict() for t in tasks]})

@app.route('/tasks/by-project', methods=['GET'])
@login_required
def tasks_by_project():
    tasks = Task.query.all()
    projects = {}
    for task in tasks:
        proj = task.project
        if proj not in projects:
            projects[proj] = []
        projects[proj].append(task.to_dict())
    return jsonify(projects)

# Stats & Dashboard
@app.route('/stats/dashboard', methods=['GET'])
@login_required
def get_dashboard_stats():
    user_id = session.get('user_id')
    user = User.query.get(user_id)
    
    if user.role == 'admin':
        tasks = Task.query.all()
    else:
        tasks = Task.query.filter_by(assigned_to=user.username).all()
    
    total = len(tasks)
    completed = len([t for t in tasks if t.completed])
    pending = total - completed
    overdue = len([t for t in tasks if t.due_date and not t.completed and t.due_date < str(datetime.utcnow().date())])
    
    by_priority = {
        'high': len([t for t in tasks if t.priority == 'high']),
        'medium': len([t for t in tasks if t.priority == 'medium']),
        'low': len([t for t in tasks if t.priority == 'low'])
    }
    
    by_project = {}
    for task in tasks:
        proj = task.project
        if proj not in by_project:
            by_project[proj] = {'total': 0, 'completed': 0}
        by_project[proj]['total'] += 1
        if task.completed:
            by_project[proj]['completed'] += 1
    
    return jsonify({
        'total': total,
        'completed': completed,
        'pending': pending,
        'overdue': overdue,
        'completion_rate': round((completed / total * 100) if total > 0 else 0, 1),
        'by_priority': by_priority,
        'by_project': by_project
    })

# Search
@app.route('/tasks/search', methods=['GET'])
@login_required
def search_tasks():
    user_id = session.get('user_id')
    user = User.query.get(user_id)
    query = request.args.get('q', '')
    
    if user.role == 'admin':
        tasks = Task.query.filter(Task.title.ilike(f'%{query}%') | Task.notes.ilike(f'%{query}%')).all()
    else:
        tasks = Task.query.filter_by(assigned_to=user.username).filter(
            (Task.title.ilike(f'%{query}%')) | (Task.notes.ilike(f'%{query}%'))
        ).all()
    
    return jsonify({'tasks': [t.to_dict() for t in tasks]})

# Tags
@app.route('/tags', methods=['GET', 'POST'])
@login_required
def manage_tags():
    user_id = session.get('user_id')
    
    if request.method == 'GET':
        tags = Tag.query.filter_by(user_id=user_id).all()
        return jsonify({'tags': [t.to_dict() for t in tags]})
    
    data = request.get_json()
    tag = Tag(user_id=user_id, name=data.get('name'), color=data.get('color', '#667eea'))
    db.session.add(tag)
    db.session.commit()
    return jsonify(tag.to_dict()), 201

@app.route('/tags/<int:tag_id>', methods=['DELETE'])
@login_required
def delete_tag(tag_id):
    tag = Tag.query.get(tag_id)
    if not tag or tag.user_id != session.get('user_id'):
        return jsonify({"error": "Not found"}), 404
    db.session.delete(tag)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200

@app.route('/tasks/<int:task_id>/tags/<int:tag_id>', methods=['POST', 'DELETE'])
@login_required
def manage_task_tags(task_id, tag_id):
    task = Task.query.get(task_id)
    tag = Tag.query.get(tag_id)
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

# Saved Filters
@app.route('/filters', methods=['GET', 'POST'])
@login_required
def manage_filters():
    user_id = session.get('user_id')
    
    if request.method == 'GET':
        filters = SavedFilter.query.filter_by(user_id=user_id).all()
        return jsonify({'filters': [f.to_dict() for f in filters]})
    
    data = request.get_json()
    filter_obj = SavedFilter(user_id=user_id, name=data.get('name'), filters=data.get('filters'))
    db.session.add(filter_obj)
    db.session.commit()
    return jsonify(filter_obj.to_dict()), 201

@app.route('/filters/<int:filter_id>', methods=['DELETE'])
@login_required
def delete_filter(filter_id):
    filter_obj = SavedFilter.query.get(filter_id)
    if not filter_obj or filter_obj.user_id != session.get('user_id'):
        return jsonify({"error": "Not found"}), 404
    db.session.delete(filter_obj)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200

# Activity Log
@app.route('/activity', methods=['GET'])
@login_required
def get_activity_log():
    limit = request.args.get('limit', 50, type=int)
    activity = ActivityLog.query.order_by(ActivityLog.created_at.desc()).limit(limit).all()
    return jsonify({'activity': [a.to_dict() for a in activity]})

# Templates
@app.route('/templates', methods=['GET', 'POST'])
@login_required
def manage_templates():
    user_id = session.get('user_id')
    
    if request.method == 'GET':
        templates = TaskTemplate.query.filter_by(user_id=user_id).all()
        return jsonify({'templates': [t.to_dict() for t in templates]})
    
    data = request.get_json()
    template = TaskTemplate(
        user_id=user_id,
        name=data.get('name'),
        description=data.get('description'),
        template_data=data.get('template_data')
    )
    db.session.add(template)
    db.session.commit()
    return jsonify(template.to_dict()), 201

@app.route('/templates/<int:template_id>', methods=['DELETE'])
@login_required
def delete_template(template_id):
    template = TaskTemplate.query.get(template_id)
    if not template or template.user_id != session.get('user_id'):
        return jsonify({"error": "Not found"}), 404
    db.session.delete(template)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200

@app.route('/templates/<int:template_id>/use', methods=['POST'])
@login_required
def use_template(template_id):
    user_id = session.get('user_id')
    user = User.query.get(user_id)
    
    if user.role != 'admin':
        return jsonify({"error": "Only admins can create tasks"}), 403
    
    template = TaskTemplate.query.get(template_id)
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

# Task Dependencies
@app.route('/tasks/<int:task_id>/dependencies', methods=['GET', 'POST'])
@login_required
def manage_dependencies(task_id):
    task = Task.query.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    
    if request.method == 'GET':
        deps = TaskDependency.query.filter_by(task_id=task_id).all()
        return jsonify({'dependencies': [d.to_dict() for d in deps]})
    
    data = request.get_json()
    dep = TaskDependency(task_id=task_id, depends_on_task_id=data.get('depends_on_task_id'))
    db.session.add(dep)
    db.session.commit()
    return jsonify(dep.to_dict()), 201

@app.route('/dependencies/<int:dep_id>', methods=['DELETE'])
@login_required
def delete_dependency(dep_id):
    dep = TaskDependency.query.get(dep_id)
    if not dep:
        return jsonify({"error": "Not found"}), 404
    db.session.delete(dep)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200

# Custom Fields
@app.route('/tasks/<int:task_id>/fields', methods=['POST'])
@login_required
def add_custom_field(task_id):
    task = Task.query.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    
    data = request.get_json()
    field = CustomField(
        user_id=session.get('user_id'),
        task_id=task_id,
        field_name=data.get('field_name'),
        field_value=data.get('field_value')
    )
    db.session.add(field)
    db.session.commit()
    return jsonify(field.to_dict()), 201

# Bulk Operations
@app.route('/tasks/bulk/complete', methods=['PUT'])
@login_required
def bulk_complete_tasks():
    user_id = session.get('user_id')
    user = User.query.get(user_id)
    
    if user.role != 'admin':
        return jsonify({"error": "Tylko administrator może edytować masowo"}), 403
    
    data = request.get_json()
    task_ids = data.get('task_ids', [])
    
    for task_id in task_ids:
        task = Task.query.get(task_id)
        if task:
            task.completed = True
    
    db.session.commit()
    socketio.emit('task_action', {'action': 'zakończono masowo', 'task_ids': task_ids}, broadcast=True)
    return jsonify({"message": f"Zakończono {len(task_ids)} zadań"}), 200

@app.route('/tasks/bulk/delete', methods=['DELETE'])
@login_required
def bulk_delete_tasks():
    user_id = session.get('user_id')
    user = User.query.get(user_id)
    
    if user.role != 'admin':
        return jsonify({"error": "Tylko administrator może usuwać masowo"}), 403
    
    data = request.get_json()
    task_ids = data.get('task_ids', [])
    
    count = 0
    for task_id in task_ids:
        task = Task.query.get(task_id)
        if task:
            db.session.delete(task)
            count += 1
    
    db.session.commit()
    socketio.emit('task_action', {'action': 'usunięto masowo', 'task_ids': task_ids}, broadcast=True)
    return jsonify({"message": f"Usunięto {count} zadań"}), 200

@app.route('/tasks/bulk/update', methods=['PUT'])
@login_required
def bulk_update_tasks():
    user_id = session.get('user_id')
    user = User.query.get(user_id)
    
    if user.role != 'admin':
        return jsonify({"error": "Tylko administrator może edytować masowo"}), 403
    
    data = request.get_json()
    task_ids = data.get('task_ids', [])
    updates = data.get('updates', {})
    
    for task_id in task_ids:
        task = Task.query.get(task_id)
        if task:
            for key, value in updates.items():
                if key != 'id' and key != 'user_id' and hasattr(task, key):
                    setattr(task, key, value)
    
    db.session.commit()
    socketio.emit('task_action', {'action': 'zaktualizowano masowo', 'task_ids': task_ids}, broadcast=True)
    return jsonify({"message": f"Zaktualizowano {len(task_ids)} zadań"}), 200

@app.route('/users', methods=['GET'])
# Export
@app.route('/tasks/export/csv', methods=['GET'])
@login_required
def export_csv():
    import csv
    from io import StringIO
    
    user_id = session.get('user_id')
    user = User.query.get(user_id)
    
    if user.role == 'admin':
        tasks = Task.query.all()
    else:
        tasks = Task.query.filter_by(assigned_to=user.username).all()
    
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Title', 'Priority', 'Project', 'Assigned To', 'Due Date', 'Status', 'Notes'])
    
    for task in tasks:
        writer.writerow([
            task.id,
            task.title,
            task.priority,
            task.project,
            task.assigned_to,
            task.due_date,
            'Completed' if task.completed else 'Pending',
            task.notes
        ])
    
    response_data = output.getvalue()
    return response_data, 200, {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename=tasks.csv'
    }

if __name__ == '__main__':
    import socket
    # Enable socket address reuse to avoid "Address already in use" errors
    socketio.run(
        app,
        debug=True,
        host='0.0.0.0',
        port=5000,
        allow_unsafe_werkzeug=True,
        use_reloader=False
    )
    # Note: For production, use: gunicorn --worker-class gthread -w 2 --bind 0.0.0.0:5000 app:app
