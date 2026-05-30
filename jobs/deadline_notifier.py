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

    now = datetime.now(timezone.utc)
    upcoming_deadline = now + timedelta(hours=24)

    tasks = Task.query.filter(
        Task.due_date.isnot(None),
        Task.completed == False,
        Task.due_date <= upcoming_deadline.date(),
        Task.due_date >= now.date()
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

    if has_app_context():
        return run_deadline_check()

    scheduler_app = getattr(scheduler, "app", None)
    if scheduler_app is None:
        logger.error("Deadline check skipped: no Flask application context is available.")
        return 0

    with scheduler_app.app_context():
        return run_deadline_check()
