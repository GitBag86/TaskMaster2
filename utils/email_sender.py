from flask import current_app
from flask_mail import Message
import os

def send_email(to_email, subject, body):
    msg = Message(subject, recipients=[to_email])
    msg.body = body
    try:
        mail = current_app.extensions.get('mail')
        if mail:
            mail.send(msg)
            current_app.logger.info(f"Email sent to {to_email} with subject: {subject}")
            return True
        else:
            current_app.logger.error("Flask-Mail not initialized.")
            return False
    except Exception as e:
        current_app.logger.error(f"Failed to send email to {to_email}: {e}")
        return False


def get_task_status_change_body(task_title, old_status, new_status, task_link):
    return f"""
Cześć,

Status zadania '{task_title}' zmienił się z '{old_status}' na '{new_status}'.

Sprawdź zadanie tutaj: {task_link}

Pozdrawiamy,
Zespół Task Manager
"""

def get_task_assignment_body(task_title, assignee_username, task_link):
    return f"""
Cześć {assignee_username},

Zostałeś przypisany do zadania '{task_title}'.

Sprawdź zadanie tutaj: {task_link}

Pozdrawiamy,
Zespół Task Manager
"""

def get_deadline_warning_body(task_title, due_date, task_link):
    return f"""
Cześć,

Termin wykonania zadania '{task_title}' zbliża się ({due_date}).

Sprawdź zadanie tutaj: {task_link}

Pozdrawiamy,
Zespół Task Manager
"""
