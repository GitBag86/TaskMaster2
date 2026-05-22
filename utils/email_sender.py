from flask import current_app
from flask_mail import Message
from extensions import mail

def send_email(to_email, subject, body):
    msg = Message(subject, recipients=[to_email])
    msg.body = body
    try:
        mail.send(msg)
        current_app.logger.info(f"Email sent to {to_email} with subject: {subject}")
        return True
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

def get_task_completion_body(task_title, recipient_username, actor_username, completed, task_link):
    action = "zakończone" if completed else "przywrócone"
    return f"""
Cześć {recipient_username},

Zadanie '{task_title}' zostało {action} przez użytkownika {actor_username}.

Sprawdź zadanie tutaj: {task_link}

Pozdrawiamy,
Zespół Task Manager
"""

def get_project_completed_body(project_name, recipient_username, actor_username, project_link):
    return f"""
Cześć {recipient_username},

Projekt '{project_name}' został zakończony przez użytkownika {actor_username}.

Sprawdź projekt tutaj: {project_link}

Pozdrawiamy,
Zespół Task Manager
"""

def get_project_activity_body(project_name, recipient_username, actor_username, activity, project_link, task_title=None):
    task_line = f"\nZadanie: {task_title}\n" if task_title else ""
    return f"""
Cześć {recipient_username},

W projekcie '{project_name}' pojawiła się zmiana: {activity}.
{task_line}
Zmianę wykonał(a): {actor_username}.

Sprawdź projekt tutaj: {project_link}

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
