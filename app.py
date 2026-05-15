from flask import Flask, request, jsonify, send_file, session
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
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
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///tasks.db'
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-key-change-in-production')
CORS(app, supports_credentials=True)

# Auth decorators
from functools import wraps

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({"error": "Not logged in"}), 401
        return f(*args, **kwargs)
    return decorated_function

def validate_user_role(allowed_roles=None):
    allowed_roles = allowed_roles or ['admin']
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user_id = session.get('user_id')
            if not user_id:
                return jsonify({"error": "Not logged in"}), 401
            user = User.query.get(user_id)
            if user.role not in allowed_roles:
                return jsonify({"error": "Insufficient permissions"}), 403
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
    assigned_to = db.Column(db.String(100), default='Unassigned')
    priority = db.Column(db.String(20), default='medium')
    project = db.Column(db.String(100), default='General')
    due_date = db.Column(db.String(20), default='')
    notes = db.Column(db.Text, default='')
    completed = db.Column(db.Boolean, default=False)
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
            'comments': [c.to_dict() for c in self.comments],
            'subtasks': [s.to_dict() for s in self.subtasks],
            'created_at': self.created_at.isoformat()
        }

class Comment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)
    author = db.Column(db.String(100), default='Anonymous')
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

with app.app_context():
    db.create_all()

@app.route('/')
def index():
    return send_file('index.html')

@app.route('/auth/signup', methods=['POST'])
def signup():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "User already exists"}), 400

    is_first_user = User.query.first() is None
    user = User(username=username, email=data.get('email', ''), role='admin' if is_first_user else 'user')
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    session['user_id'] = user.id
    return jsonify({"message": "Signup successful", "user": user.to_dict()}), 201

@app.route('/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid credentials"}), 401

    session['user_id'] = user.id
    return jsonify({"message": "Login successful", "user": user.to_dict()})

@app.route('/auth/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    return jsonify({"message": "Logged out"})

@app.route('/auth/me', methods=['GET'])
def get_current_user():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Not logged in"}), 401

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    return jsonify(user.to_dict())

@app.route('/users', methods=['GET'])
@login_required
@login_required
def get_users():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Not logged in"}), 401

    user = User.query.get(user_id)
    if user.role != 'admin':
        return jsonify({"error": "Only admins can view users"}), 403

    users = User.query.all()
    return jsonify({"users": [u.to_dict() for u in users]})

@app.route('/tasks', methods=['GET'])
@login_required
def get_tasks():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Not logged in"}), 401

    user = User.query.get(user_id)

    if user.role == 'admin':
        tasks = Task.query.all()
    else:
        tasks = Task.query.filter_by(assigned_to=user.username).all()

    return jsonify({"tasks": [t.to_dict() for t in tasks]})

@app.route('/tasks', methods=['POST'])
def create_task():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Not logged in"}), 401

    user = User.query.get(user_id)
    if user.role != 'admin':
        return jsonify({"error": "Only admins can create tasks"}), 403

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
    return jsonify(task.to_dict()), 201

@app.route('/tasks/<int:task_id>', methods=['PUT'])
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
    return jsonify(task.to_dict())

@app.route('/tasks/<int:task_id>', methods=['DELETE'])
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

    db.session.delete(task)
    db.session.commit()
    return jsonify({"message": "Task deleted"}), 200

@app.route('/tasks/<int:task_id>/complete', methods=['PUT'])
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
    return jsonify(task.to_dict())

@app.route('/tasks/<int:task_id>/comments', methods=['POST'])
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

@login_required
@app.route('/tasks/filter', methods=['GET'])
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
def tasks_by_project():
    tasks = Task.query.all()
    projects = {}
    for task in tasks:
        proj = task.project
        if proj not in projects:
            projects[proj] = []
        projects[proj].append(task.to_dict())
    return jsonify(projects)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
