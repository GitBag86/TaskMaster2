from flask import request, jsonify, session
from datetime import datetime, timezone
from routes import stats_bp
from models import db, User, Task, ActivityLog
from routes.auth import login_required
import csv
from io import StringIO

def assigned_task_query(user):
    return Task.query.filter(Task.assignees.any(User.id == user.id))

def assignee_names(task):
    return ', '.join(assignee.username for assignee in task.assignees)

@stats_bp.route('/stats/dashboard', methods=['GET'])
@login_required
def get_dashboard_stats():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if user.role == 'admin':
        tasks = Task.query.all()
    else:
        tasks = assigned_task_query(user).all()

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

@stats_bp.route('/activity', methods=['GET'])
@login_required
def get_activity_log():
    limit = request.args.get('limit', 50, type=int)
    limit = min(limit, 200)
    activity = ActivityLog.query.order_by(ActivityLog.created_at.desc()).limit(limit).all()
    return jsonify({'activity': [a.to_dict() for a in activity]})

@stats_bp.route('/tasks/export/csv', methods=['GET'])
@login_required
def export_csv():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)

    if user.role == 'admin':
        tasks = Task.query.all()
    else:
        tasks = assigned_task_query(user).all()

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
