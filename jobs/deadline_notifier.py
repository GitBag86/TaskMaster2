from datetime import datetime, timedelta, timezone
import logging

from flask import current_app, has_app_context, url_for
from werkzeug.routing import BuildError

from extensions import scheduler
from models import db, Task
from utils.email_sender import send_email, get_deadline_warning_body

logger = logging.getLogger(__name__)


def task_link(task):
    base_url = current_app.config.get("PUBLIC_BASE_URL")
    if base_url:
        return f"{base_url.rstrip('/')}/tasks/{task.id}"

    try:
        return url_for('index', _external=True) + f'tasks/{task.id}'
    except (RuntimeError, BuildError):
        current_app.logger.warning(
            "PUBLIC_BASE_URL is not configured; deadline email for task %s will use a relative link.",
            task.id,
        )
        return f"/tasks/{task.id}"


def run_deadline_check():
    current_app.logger.info("Running deadline check job.")

    now = datetime.now(timezone.utc).date()
    upcoming_deadline = now + timedelta(days=1)

    tasks = Task.query.filter(
        Task.due_date.isnot(None),
        Task.completed == False,
        Task.due_date <= upcoming_deadline,
        Task.due_date >= now
    ).all()

    sent_count = 0
    for task in tasks:
        if not task.assignees:
            current_app.logger.warning("Could not send deadline warning for task %s: no assignees.", task.id)
            continue

        subject = f"Zbliża się termin wykonania zadania: {task.title}"
        body = get_deadline_warning_body(task.title, task.due_date.isoformat(), task_link(task))

        for assignee_user in task.assignees:
            if not assignee_user.email:
                continue
            if send_email(assignee_user.email, subject, body):
                sent_count += 1
                current_app.logger.info("Sent deadline warning for task %s to %s", task.id, assignee_user.email)

    current_app.logger.info(
        "Deadline check job completed. %s tasks with upcoming deadlines found, %s emails sent.",
        len(tasks),
        sent_count,
    )
    return sent_count


def check_deadlines(app=None):
    if app is not None:
        with app.app_context():
            return run_deadline_check()
    elif has_app_context():
        return run_deadline_check()
    else:
        scheduler_app = getattr(scheduler, "app", None)
        if scheduler_app is None:
            logger.error("Deadline check skipped: no Flask application context is available.")
            return 0
        with scheduler_app.app_context():
            return run_deadline_check()


def archive_completed_tasks(app=None):
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=3)

    archived_count = 0
    query = Task.query.filter(
        Task.completed == True,
        Task.archived == False,
        Task.completed_at.isnot(None),
        Task.completed_at <= cutoff,
    )
    for task in query.all():
        task.archived = True
        archived_count += 1

    if archived_count:
        db.session.commit()
        db.session.remove()

    current_app.logger.info("Archived %s completed tasks older than 3 days.", archived_count)
    return archived_count


def run_scheduler_jobs(app=None):
    if app is not None:
        with app.app_context():
            check_deadlines()
            archive_completed_tasks()
    elif has_app_context():
        check_deadlines()
        archive_completed_tasks()
    else:
        scheduler_app = getattr(scheduler, "app", None)
        if scheduler_app is None:
            logger.error("Scheduler jobs skipped: no Flask application context.")
            return
        with scheduler_app.app_context():
            check_deadlines()
            archive_completed_tasks()