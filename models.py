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

project_members = db.Table('project_members',
    db.Column('project_id', db.Integer, db.ForeignKey('project.id'), primary_key=True),
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
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=True)
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
    dependencies = db.relationship(
        'TaskDependency',
        foreign_keys='TaskDependency.task_id',
        back_populates='task',
        lazy=True,
        cascade='all, delete-orphan',
    )
    dependent_links = db.relationship(
        'TaskDependency',
        foreign_keys='TaskDependency.depends_on_task_id',
        back_populates='depends_on_task',
        lazy=True,
        cascade='all, delete-orphan',
    )
    created_at = db.Column(db.DateTime, default=utcnow)

    def summary_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'status': self.status,
            'completed': self.completed,
            'project': self.project,
            'due_date': self.due_date.isoformat() if self.due_date else None,
        }

    def open_dependency_tasks(self):
        return [
            dependency.depends_on_task
            for dependency in self.dependencies
            if dependency.depends_on_task
            and not dependency.depends_on_task.completed
            and dependency.depends_on_task.status != 'done'
        ]

    def open_dependent_tasks(self):
        return [
            dependency.task
            for dependency in self.dependent_links
            if dependency.task
            and not dependency.task.completed
            and dependency.task.status != 'done'
        ]

    def to_dict(self):
        blocked_by = [task.summary_dict() for task in self.open_dependency_tasks()]
        return {
            'id': self.id,
            'title': self.title,
            'assignees': [u.to_dict() for u in self.assignees], # Updated to include assignees
            'priority': self.priority,
            'project': self.project,
            'project_id': self.project_id,
            'project_info': self.project_record.to_dict(include_tasks=False) if self.project_record else None,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'notes': self.notes,
            'completed': self.completed,
            'status': self.status,
            'comments': [c.to_dict() for c in self.comments],
            'subtasks': [s.to_dict() for s in self.subtasks],
            'dependencies': [dependency.to_dict() for dependency in self.dependencies],
            'blocked_by': blocked_by,
            'blocking': [task.summary_dict() for task in self.open_dependent_tasks()],
            'is_blocked': len(blocked_by) > 0,
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
    task = db.relationship('Task', foreign_keys=[task_id], back_populates='dependencies')
    depends_on_task = db.relationship('Task', foreign_keys=[depends_on_task_id], back_populates='dependent_links')

    def to_dict(self):
        return {
            'id': self.id,
            'task_id': self.task_id,
            'depends_on_task_id': self.depends_on_task_id,
            'depends_on_task': self.depends_on_task.summary_dict() if self.depends_on_task else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
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

class Notification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    task_id = db.Column(db.Integer, db.ForeignKey('task.id'), nullable=True)
    actor = db.Column(db.String(100), nullable=True)
    type = db.Column(db.String(50), nullable=False)
    message = db.Column(db.String(300), nullable=False)
    read = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=utcnow)
    user = db.relationship('User', backref=db.backref('notifications', lazy=True, cascade='all, delete-orphan'))
    task = db.relationship('Task', backref=db.backref('notifications', lazy=True))

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'task_id': self.task_id,
            'actor': self.actor,
            'type': self.type,
            'message': self.message,
            'read': self.read,
            'task': self.task.summary_dict() if self.task else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.String(500), default='')
    color = db.Column(db.String(7), default='#3b82f6')
    archived = db.Column(db.Boolean, nullable=False, default=False)
    created_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow)
    members = db.relationship('User', secondary=project_members, lazy='subquery',
                              backref=db.backref('member_projects', lazy=True))
    tasks = db.relationship('Task', backref='project_record', lazy=True)

    def to_dict(self, include_tasks=True):
        data = {
            'id': self.id,
            'name': self.name,
            'description': self.description or '',
            'color': self.color,
            'archived': self.archived,
            'created_by_id': self.created_by_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'members': [member.to_dict() for member in self.members],
        }
        if include_tasks:
            data['tasks'] = [task.to_dict() for task in self.tasks]
        return data
