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
    # Team workspaces (R2-R3): super_admin has team_id NULL, manager/user must have one.
    # NOT NULL constraint + CHECK come in a later migration (Task 7) once data is backfilled.
    # use_alter=True breaks the User<->Team circular FK at table-drop time (Team.created_by_id
    # also references user.id), important for clean test teardown on SQLite.
    team_id = db.Column(
        db.Integer,
        db.ForeignKey('team.id', name='fk_user_team_id', use_alter=True),
        nullable=True,
    )
    # Bumped on team move / team archival to invalidate active sessions (R7.7, R25.3).
    session_version = db.Column(db.Integer, nullable=False, default=0, server_default='0')
    tasks = db.relationship('Task', backref='owner', lazy=True, cascade='all, delete-orphan')
    created_at = db.Column(db.DateTime, default=utcnow)

    # Backref `team` on User; backref `members` on Team. Foreign keys on team_id.
    team = db.relationship('Team', backref=db.backref('members', lazy=True), foreign_keys=[team_id])

    def set_password(self, password):
        self.password = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password, password)

    # Role helpers (R2: super_admin / manager / user)
    def is_super_admin(self) -> bool:
        return self.role == 'super_admin'

    def is_manager(self) -> bool:
        return self.role == 'manager'

    def is_team_member(self) -> bool:
        """Manager or user — anyone bound to exactly one team."""
        return self.role in ('manager', 'user')

    def to_dict(self, expand_team: bool = False):
        data = {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'team_id': self.team_id,
            'terms_accepted': self.terms_accepted,
            'privacy_accepted': self.privacy_accepted,
            'marketing_consent': self.marketing_consent,
            'consented_at': self.consented_at.isoformat() if self.consented_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        if expand_team and self.team is not None:
            data['team'] = self.team.to_dict()
        return data

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



# ============================================================
# Team workspaces (multi-tenancy)
# Wprowadzone w ramach feature/team-workspaces.
# Zobacz .kiro/specs/team-workspaces/ dla pełnego kontekstu.
# ============================================================

class Team(db.Model):
    """Workspace owning a disjoint set of users, tasks, projects, etc.

    Identified by a unique non-archived name (case-insensitive).
    See requirements R1, design 3.1.
    """

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    slug = db.Column(db.String(80), unique=True, nullable=False)
    description = db.Column(db.String(500), nullable=False, default='', server_default='')
    archived = db.Column(db.Boolean, nullable=False, default=False, server_default=db.text('false'))
    created_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self, include_stats: bool = False) -> dict:
        data = {
            'id': self.id,
            'name': self.name,
            'slug': self.slug,
            'description': self.description or '',
            'archived': self.archived,
            'created_by_id': self.created_by_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_stats:
            # Counts loaded on demand. The `members` relationship is added later
            # via User.team backref (Task 3). Until then count returns 0 (no
            # team_id column on User yet). After Task 3 the same code keeps working
            # because `members` will exist as a relationship attribute.
            members = getattr(self, 'members', None)
            data['stats'] = {
                'members': len(members) if members else 0,
            }
        return data


class TeamInvite(db.Model):
    """Single-use invite token issued by a manager to onboard a team member.

    Stored as SHA-256 hash; raw token returned only once at creation time.
    See requirements R8, design 8.1.
    """

    __tablename__ = 'team_invite'

    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey('team.id', ondelete='CASCADE'), nullable=False)
    token_hash = db.Column(db.String(64), unique=True, nullable=False)
    created_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)
    consumed_at = db.Column(db.DateTime, nullable=True)
    consumed_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    default_role = db.Column(db.String(20), nullable=False, default='user', server_default='user')

    team = db.relationship('Team', backref=db.backref('invites', lazy=True, cascade='all, delete-orphan'))

    def is_active(self) -> bool:
        """True only if not consumed and not expired.

        Compares in naive UTC because SQLite strips timezone info on read;
        Postgres stores TIMESTAMPTZ but Flask-SQLAlchemy's default Python type
        also gives naive on read for plain DateTime columns.
        """
        if self.consumed_at is not None:
            return False
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        expires = self.expires_at
        if expires.tzinfo is not None:
            expires = expires.astimezone(timezone.utc).replace(tzinfo=None)
        return expires > now

    def to_dict(self, include_token: str | None = None) -> dict:
        """Serialize. `include_token` (raw, plain) only passed at creation time."""
        data = {
            'id': self.id,
            'team_id': self.team_id,
            'created_by_id': self.created_by_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'consumed_at': self.consumed_at.isoformat() if self.consumed_at else None,
            'consumed_by_id': self.consumed_by_id,
            'default_role': self.default_role,
            'active': self.is_active(),
        }
        if include_token is not None:
            data['token'] = include_token  # raw, plaintext - never persisted
        return data


class TeamAuditLog(db.Model):
    """Audit trail for super-admin team-management operations.

    Visible only to super-admin (R26.3); not part of any team-scoped feed.
    Actions follow `<entity>.<verb>` convention: 'team.create', 'team.archive',
    'user.move', 'user.role_change', 'invite.generate', 'invite.revoke', etc.
    """

    __tablename__ = 'team_audit_log'

    id = db.Column(db.Integer, primary_key=True)
    actor_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    action = db.Column(db.String(50), nullable=False)
    target_team_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=True)
    target_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    source_team_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=True)
    details = db.Column(db.JSON, nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow)

    actor = db.relationship('User', foreign_keys=[actor_id])
    target_user = db.relationship('User', foreign_keys=[target_user_id])
    target_team = db.relationship('Team', foreign_keys=[target_team_id])
    source_team = db.relationship('Team', foreign_keys=[source_team_id])

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'actor_id': self.actor_id,
            'actor': self.actor.username if self.actor else None,
            'action': self.action,
            'target_team_id': self.target_team_id,
            'target_user_id': self.target_user_id,
            'source_team_id': self.source_team_id,
            'details': self.details,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
