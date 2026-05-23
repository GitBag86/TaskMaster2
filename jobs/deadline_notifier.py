from flask import current_app, url_for
from datetime import datetime, timedelta, timezone
from models import db, Task, User
from utils.email_sender import send_email, get_deadline_warning_body

def check_deadlines():
    with current_app.app_context():
        logger = current_app.logger
        logger.info("Running deadline check job.")

        now = datetime.now(timezone.utc)
        # Look for tasks due in the next 24 hours (or less)
        upcoming_deadline = now + timedelta(hours=24)

        tasks = Task.query.filter(
            Task.due_date.isnot(None),
            Task.completed == False,
            Task.due_date <= upcoming_deadline.date(),
            Task.due_date >= now.date()
        ).all()

        for task in tasks:
            if not task.assignees:
                logger.warning("Could not send deadline warning for task %s: no assignees.", task.id)
                continue

            task_link = url_for('index', _external=True) + f'tasks/{task.id}'
            subject = f"Zbliża się termin wykonania zadania: {task.title}"
            body = get_deadline_warning_body(task.title, task.due_date.isoformat(), task_link)

            for assignee_user in task.assignees:
                if not assignee_user.email:
                    continue
                send_email(assignee_user.email, subject, body)
                logger.info("Sent deadline warning for task %s to %s", task.id, assignee_user.email)

        logger.info(f"Deadline check job completed. {len(tasks)} tasks with upcoming deadlines found.")
