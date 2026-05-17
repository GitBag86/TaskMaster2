from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

def utcnow():
    return datetime.now(timezone.utc)

# Association table for many-to-many relationship between Task and User (assignees)
task_assignees = db.Table('task_assignees',
    db.Column('task_id', db.Integer, db.ForeignKey('task.id'), primary_key=True),
    db.Column('user_id', db.Integer, db.ForeignKey('user.id'), primary_key=True)
)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False) # Made mandatory
    role = db.Column(db.String(20), default='user')
    terms_accepted = db.Column(db.Boolean, nullable=False, default=False)
    privacy_accepted = db.Column(db.Boolean, nullable=False, default=False)
    marketing_consent = db.Column(db.Boolean, nullable=False, default=False)
    consented_at = db.Column(db.DateTime, nullable=True)
    tasks = db.relationship('Task', backref='owner', lazy=True, cascade='all, delete-orphan')
    created_at = db.Column(db.DateTime, default=utcnow)

    def set_password(self, password):
        self.password = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password, password)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'terms_accepted': self.terms_accepted,
            'privacy_accepted': self.privacy_accepted,
            'marketing_consent': self.marketing_consent,
            'consented_at': self.consented_at.isoformat() if self.consented_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    assignees = db.relationship('User', secondary=task_assignees, lazy='subquery',
                               backref=db.backref('assigned_tasks', lazy=True)) # New relationship
    title = db.Column(db.String(200), nullable=False)
    priority = db.Column(db.String(20), default='medium')
    project = db.Column(db.String(100), default='Ogólny')
    due_date = db.Column(db.Date, nullable=True)
    notes = db.Column(db.Text, default='')
    completed = db.Column(db.Boolean, default=False)
    status = db.Column(db.String(20), default='todo')
    comments = db.relationship('Comment', backref='task', lazy=True, cascade='all, delete-orphan')
    subtasks = db.relationship('Subtask', backref='task', lazy=True, cascade='all, delete-orphan')
    created_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'assignees': [u.to_dict() for u in self.assignees], # Updated to include assignees
            'priority': self.priority,
            'project': self.project,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'notes': self.notes,
            'completed': self.completed,
            'status': self.status,
            'comments': [c.to_dict() for c in self.comments],
            'subtasks': [s.to_dict() for s in self.subtasks],
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class Comment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)
    author = db.Column(db.String(100), default='Anonimowy')
    text = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'author': self.author,
            'text': self.text,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class Subtask(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    completed = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=utcnow)

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
    created_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'color': self.color}

task_tags = db.Table('task_tags',
    db.Column('task_id', db.Integer, db.ForeignKey('task.id'), primary_key=True),
    db.Column('tag_id', db.Integer, db.ForeignKey('tag.id'), primary_key=True)
)

Task.tags = db.relationship('Tag', secondary=task_tags, lazy='subquery',
                            backref=db.backref('tasks', lazy=True))

class SavedFilter(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    filters = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'filters': self.filters}

class ActivityLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'))
    action = db.Column(db.String(50), nullable=False)
    details = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'task_id': self.task_id,
            'action': self.action,
            'details': self.details,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class RecurringTask(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=False)
    frequency = db.Column(db.String(20), nullable=False)
    interval = db.Column(db.Integer, default=1)
    end_date = db.Column(db.Date, nullable=True)
    last_generated = db.Column(db.DateTime, default=utcnow)
    created_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'task_id': self.task_id,
            'frequency': self.frequency,
            'interval': self.interval,
            'end_date': self.end_date.isoformat() if self.end_date else None
        }

class TaskTemplate(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.String(500))
    template_data = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow)

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
    created_at = db.Column(db.DateTime, default=utcnow)

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
    created_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'field_name': self.field_name,
            'field_value': self.field_value,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
