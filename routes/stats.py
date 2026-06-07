from flask import g, request, jsonify, session
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import selectinload
from routes import stats_bp
from models import db, User, Task, TaskDependency, ActivityLog
from routes.auth import login_required
from utils.scoping import team_scoped
import csv
from io import StringIO

def assigned_task_query(user):
    return team_scoped(Task.query, Task).filter(Task.assignees.any(User.id == user.id))

def visible_task_query(user):
    if g.get('current_role') in ('manager', 'super_admin'):
        return team_scoped(Task.query, Task)
    return assigned_task_query(user)

def assignee_names(task):
    return ', '.join(assignee.username for assignee in task.assignees)

def task_is_done(task):
    return task.completed or task.status == 'done'

def task_is_blocked(task):
    return any(
        dependency.depends_on_task
        and not task_is_done(dependency.depends_on_task)
        for dependency in task.dependencies
    )

def as_utc(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)

@stats_bp.route('/stats/dashboard', methods=['GET'])
@login_required
def get_dashboard_stats():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    tasks = visible_task_query(user).all()

    total = len(tasks)
    completed = len([t for t in tasks if t.completed])
    pending = total - completed
    today = datetime.now(timezone.utc).date()
    overdue = len([t for t in tasks if t.due_date and not t.completed and t.due_date < today])

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

    completion_rate = round((completed / total * 100), 1) if total > 0 else 0

    return jsonify({
        'total': total,
        'completed': completed,
        'pending': pending,
        'overdue': overdue,
        'completion_rate': completion_rate,
        'by_priority': by_priority,
        'by_project': by_project
    })

@stats_bp.route('/reports/weekly', methods=['GET'])
@login_required
def get_weekly_report():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    now = datetime.now(timezone.utc)
    week_start = now - timedelta(days=7)
    today = now.date()

    tasks = (
        visible_task_query(user)
        .options(selectinload(Task.dependencies).selectinload(TaskDependency.depends_on_task))
        .all()
    )
    visible_task_ids = {task.id for task in tasks}

    created = [task for task in tasks if as_utc(task.created_at) and as_utc(task.created_at) >= week_start]
    completed_logs = (
        ActivityLog.query
        .filter(ActivityLog.action == 'completed', ActivityLog.created_at >= week_start)
        .filter(ActivityLog.team_id == g.get('current_team_id'))
        .all()
    )
    completed_logs = [log for log in completed_logs if log.task_id in visible_task_ids]
    overdue = [task for task in tasks if not task_is_done(task) and task.due_date and task.due_date < today]
    blocked = [task for task in tasks if not task_is_done(task) and task_is_blocked(task)]

    by_project = {}
    for task in tasks:
        project = task.project
        if project not in by_project:
            by_project[project] = {'total': 0, 'completed': 0, 'open': 0}
        by_project[project]['total'] += 1
        if task_is_done(task):
            by_project[project]['completed'] += 1
        else:
            by_project[project]['open'] += 1

    user_names = {
        found_user.id: found_user.username
        for found_user in User.query.filter(User.id.in_({log.user_id for log in completed_logs if log.user_id})).all()
    }
    completed_by_user = {}
    for log in completed_logs:
        username = user_names.get(log.user_id, 'System')
        completed_by_user[username] = completed_by_user.get(username, 0) + 1

    return jsonify({
        'range': {
            'from': week_start.date().isoformat(),
            'to': today.isoformat(),
        },
        'summary': {
            'created': len(created),
            'completed': len(completed_logs),
            'overdue': len(overdue),
            'blocked': len(blocked),
            'open': len([task for task in tasks if not task_is_done(task)]),
        },
        'created_tasks': [task.summary_dict() for task in created[:10]],
        'overdue_tasks': [task.summary_dict() for task in overdue[:10]],
        'blocked_tasks': [task.summary_dict() for task in blocked[:10]],
        'by_project': by_project,
        'completed_by_user': completed_by_user,
        'generated_at': now.isoformat(),
    })

@stats_bp.route('/activity', methods=['GET'])
@login_required
def get_activity_log():
    limit = request.args.get('limit', 50, type=int)
    limit = min(limit, 200)
    activity = (
        team_scoped(ActivityLog.query, ActivityLog)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return jsonify({'activity': [a.to_dict() for a in activity]})

@stats_bp.route('/tasks/export/csv', methods=['GET'])
@login_required
def export_csv():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    tasks = visible_task_query(user).all()

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Title', 'Priority', 'Project', 'Assigned To', 'Due Date', 'Status', 'Notes'])

    for task in tasks:
        writer.writerow([
            task.id,
            task.title,
            task.priority,
            task.project,
            assignee_names(task),
            task.due_date.isoformat() if task.due_date else '',
            'Completed' if task.completed else 'Pending',
            task.notes
        ])

    response_data = output.getvalue()
    return response_data, 200, {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename=tasks.csv'
    }
