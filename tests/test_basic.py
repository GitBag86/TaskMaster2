import sqlite3
from datetime import date, timedelta

from jobs.deadline_notifier import check_deadlines
from models import db, User, Task, Project, Tag, TaskDependency, ActivityLog, Notification, Subtask
from utils.email_sender import get_task_assignment_body, send_email

def test_health_check(client):
    response = client.get('/health')
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "healthy"
    assert "timestamp" in data

def test_readiness_check_reports_database_and_socketio(client):
    response = client.get('/ready')
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "ready"
    assert data["checks"] == {"database": True, "socketio": True}
    assert "timestamp" in data

def test_email_templates_include_html_text_and_escape_content(app, monkeypatch):
    body = get_task_assignment_body("Oferta <script>alert(1)</script>", "anna", "http://localhost/tasks/1")

    assert "text" in body
    assert "html" in body
    assert "Masz nowe zadanie" in body["html"]
    assert "Oferta <script>alert(1)</script>" in body["text"]
    assert "&lt;script&gt;" in body["html"]
    assert "<script>" not in body["html"]

    sent = []

    def fake_send(message):
        sent.append(message)

    monkeypatch.setattr("utils.email_sender.mail.send", fake_send)

    with app.app_context():
        assert send_email("anna@example.com", "Test", body) is True

    assert sent[0].body == body["text"]
    assert sent[0].html == body["html"]

def test_send_email_requires_delivery_config_when_not_suppressed(app, monkeypatch):
    sent = []

    def fake_send(message):
        sent.append(message)

    monkeypatch.setattr("utils.email_sender.mail.send", fake_send)

    with app.app_context():
        app.config.update(
            MAIL_SUPPRESS_SEND=False,
            MAIL_SERVER=None,
            MAIL_DEFAULT_SENDER=None,
            MAIL_USERNAME=None,
        )
        assert send_email("anna@example.com", "Test", "Body") is False

    assert sent == []

def test_deadline_notifier_uses_public_base_url_without_request_context(app, monkeypatch):
    sent = []

    def fake_send_email(to_email, subject, body):
        sent.append({"to": to_email, "subject": subject, "body": body})
        return True

    monkeypatch.setattr("jobs.deadline_notifier.send_email", fake_send_email)

    with app.app_context():
        app.config["PUBLIC_BASE_URL"] = "https://tasks.example.test"
        admin = User(username="deadline_admin", email="deadline_admin@example.com", role="admin")
        admin.set_password("password")
        assignee = User(username="deadline_user", email="deadline_user@example.com", role="user")
        assignee.set_password("password")
        db.session.add_all([admin, assignee])
        db.session.commit()

        task = Task(
            user_id=admin.id,
            title="Deadline task",
            due_date=date.today() + timedelta(days=1),
        )
        task.assignees.append(assignee)
        db.session.add(task)
        db.session.commit()
        task_id = task.id

    assert check_deadlines(app) == 1
    assert sent[0]["to"] == "deadline_user@example.com"
    assert sent[0]["subject"] == "Zbliża się termin wykonania zadania: Deadline task"
    assert f"https://tasks.example.test/tasks/{task_id}" in sent[0]["body"]["text"]

def test_signup(client):
    response = client.post('/auth/signup', json={
        "username": "newuser",
        "password": "password123",
        "email": "newuser@example.com",
        "accept_terms": True,
        "accept_privacy": True,
        "accept_marketing": False
    })
    assert response.status_code == 201
    assert "user" in response.get_json()
    user_data = response.get_json()["user"]
    assert user_data["terms_accepted"] is True
    assert user_data["privacy_accepted"] is True
    assert user_data["marketing_consent"] is False

def test_signup_requires_terms_and_privacy(client):
    response = client.post('/auth/signup', json={
        "username": "user_without_consents",
        "password": "password123",
        "email": "noconsent@example.com",
        "accept_terms": False,
        "accept_privacy": False,
    })
    assert response.status_code == 400
    error_payload = response.get_json()["error"]
    assert "accept_terms" in error_payload
    assert "accept_privacy" in error_payload

def test_default_admin_bootstrap(app):
    from app import _ensure_default_admin
    from models import db

    with app.app_context():
        _ensure_default_admin(app)
        admin = User.query.filter_by(username="admin").first()

        assert admin is not None
        assert admin.role == "admin"
        assert admin.email == "admin@taskmaster.local"
        assert admin.password != "dakos1admin2"
        assert admin.check_password("dakos1admin2")

def test_default_admin_bootstrap_does_not_reset_existing_password_by_default(app):
    from app import _ensure_default_admin

    with app.app_context():
        admin = User(username="admin", email="admin@example.com", role="admin")
        admin.set_password("custom-password")
        db.session.add(admin)
        db.session.commit()

        _ensure_default_admin(app)

        saved_admin = User.query.filter_by(username="admin").first()
        assert saved_admin.check_password("custom-password")
        assert not saved_admin.check_password("dakos1admin2")

def test_default_admin_bootstrap_can_reset_existing_password_when_enabled(app):
    from app import _ensure_default_admin

    with app.app_context():
        app.config["DEFAULT_ADMIN_RESET_PASSWORD"] = True
        admin = User(username="admin", email="admin@example.com", role="admin")
        admin.set_password("custom-password")
        db.session.add(admin)
        db.session.commit()

        _ensure_default_admin(app)

        saved_admin = User.query.filter_by(username="admin").first()
        assert saved_admin.check_password("dakos1admin2")

def test_login(client, app):
    with app.app_context():
        user = User(username="testlogin", email="testlogin@example.com")
        user.set_password("password")
        from models import db
        db.session.add(user)
        db.session.commit()

    response = client.post('/auth/login', json={
        "username": "testlogin",
        "password": "password"
    })
    assert response.status_code == 200
    assert "user" in response.get_json()

def test_create_task(auth_client):
    response = auth_client.post('/tasks', json={
        "title": "Test Task",
        "priority": "high",
        "project": "Test Project"
    })
    assert response.status_code == 201
    data = response.get_json()
    assert data["title"] == "Test Task"
    assert data["status"] == "todo"
    assert data["project_id"] is not None

def test_admin_can_create_empty_project(auth_client, app):
    response = auth_client.post('/projects', json={
        "name": "Launch",
        "description": "Launch work",
        "color": "#10b981",
    })

    assert response.status_code == 201
    data = response.get_json()
    assert data["name"] == "Launch"
    assert data["description"] == "Launch work"
    assert data["color"] == "#10b981"

    projects_response = auth_client.get('/projects')
    assert projects_response.status_code == 200
    projects = projects_response.get_json()["projects"]
    assert projects[0]["name"] == "Launch"
    assert projects[0]["tasks"] == []

    with app.app_context():
        assert Project.query.filter_by(name="Launch").first() is not None

def test_project_archive_requires_all_tasks_completed(auth_client):
    project = auth_client.post('/projects', json={"name": "Close gated project"}).get_json()
    task = auth_client.post('/tasks', json={
        "title": "Still open",
        "project_id": project["id"],
    }).get_json()

    blocked_response = auth_client.delete(f'/projects/{project["id"]}')

    assert blocked_response.status_code == 409
    blocked_payload = blocked_response.get_json()
    assert blocked_payload["completion"]["open_tasks"][0]["id"] == task["id"]

    auth_client.put(f'/tasks/{task["id"]}/complete')
    archived_response = auth_client.delete(f'/projects/{project["id"]}')

    assert archived_response.status_code == 200
    assert archived_response.get_json()["archived"] is True

def test_project_complete_endpoint_returns_readiness_checklist(auth_client):
    project = auth_client.post('/projects', json={"name": "Completable project"}).get_json()
    task = auth_client.post('/tasks', json={
        "title": "Finish before project",
        "project_id": project["id"],
    }).get_json()

    checklist_response = auth_client.get(f'/projects/{project["id"]}/completion')
    assert checklist_response.status_code == 200
    checklist = checklist_response.get_json()
    assert checklist["ready"] is False
    assert checklist["checks"]["all_tasks_done"] is False
    assert checklist["open_tasks"][0]["id"] == task["id"]

    blocked_response = auth_client.post(f'/projects/{project["id"]}/complete')
    assert blocked_response.status_code == 409
    assert blocked_response.get_json()["completion"]["ready"] is False

    auth_client.put(f'/tasks/{task["id"]}/complete')
    completed_response = auth_client.post(f'/projects/{project["id"]}/complete')

    assert completed_response.status_code == 200
    data = completed_response.get_json()
    assert data["archived"] is True
    assert data["completion"]["ready"] is True

def test_project_changes_email_project_participants(auth_client, app, monkeypatch):
    sent = []

    def fake_send_email(to_email, subject, body):
        sent.append({"to": to_email, "subject": subject, "body": body})
        return True

    monkeypatch.setattr("routes.tasks.send_email", fake_send_email)

    with app.app_context():
        assignee = User(username="project_mail_user", email="project_mail_user@example.com", role="user")
        assignee.set_password("password")
        db.session.add(assignee)
        db.session.commit()
        assignee_id = assignee.id

    project = auth_client.post('/projects', json={"name": "Mail project"}).get_json()
    task = auth_client.post('/tasks', json={
        "title": "Mail task",
        "project_id": project["id"],
        "assignee_ids": [assignee_id],
    }).get_json()
    sent.clear()

    completed_task_response = auth_client.put(f'/tasks/{task["id"]}/complete')
    completed_project_response = auth_client.post(f'/projects/{project["id"]}/complete')

    assert completed_task_response.status_code == 200
    assert completed_project_response.status_code == 200
    assert any(email["to"] == "project_mail_user@example.com" and "Zadanie zakończone" in email["subject"] for email in sent)
    assert any(email["to"] == "project_mail_user@example.com" and "Projekt zakończony" in email["subject"] for email in sent)

def test_project_members_can_see_project_without_unassigned_tasks(auth_client, app):
    with app.app_context():
        member = User(username="project_member", email="project_member@example.com", role="user")
        member.set_password("password")
        other_user = User(username="other_project_user", email="other_project_user@example.com", role="user")
        other_user.set_password("password")
        db.session.add_all([member, other_user])
        db.session.commit()
        member_id = member.id
        other_user_id = other_user.id

    project_response = auth_client.post('/projects', json={
        "name": "Member project",
        "member_ids": [member_id],
    })
    assert project_response.status_code == 201
    project = project_response.get_json()
    assert [member["id"] for member in project["members"]] == [member_id]

    task_response = auth_client.post('/tasks', json={
        "title": "Other user task",
        "project_id": project["id"],
        "assignee_ids": [other_user_id],
    })
    assert task_response.status_code == 201

    with auth_client.session_transaction() as sess:
        sess['user_id'] = member_id

    projects_response = auth_client.get('/projects')
    assert projects_response.status_code == 200
    projects = projects_response.get_json()["projects"]
    visible_project = next((item for item in projects if item["id"] == project["id"]), None)
    assert visible_project is not None
    assert visible_project["tasks"] == []

def test_task_accepts_only_one_assignee(auth_client, app):
    with app.app_context():
        first_user = User(username="single_assignee_one", email="single1@example.com", role="user")
        first_user.set_password("password")
        second_user = User(username="single_assignee_two", email="single2@example.com", role="user")
        second_user.set_password("password")
        db.session.add_all([first_user, second_user])
        db.session.commit()
        first_user_id = first_user.id
        second_user_id = second_user.id

    rejected_create = auth_client.post('/tasks', json={
        "title": "Too many assignees",
        "assignee_ids": [first_user_id, second_user_id],
    })
    assert rejected_create.status_code == 400

    task = auth_client.post('/tasks', json={
        "title": "Single assignee",
        "assignee_ids": [first_user_id],
    }).get_json()
    assert [assignee["id"] for assignee in task["assignees"]] == [first_user_id]

    rejected_update = auth_client.put(f'/tasks/{task["id"]}', json={
        "assignee_ids": [first_user_id, second_user_id],
    })
    assert rejected_update.status_code == 400

def test_admin_can_create_project_from_template(auth_client, app):
    templates_response = auth_client.get('/project-templates')
    assert templates_response.status_code == 200
    template_id = templates_response.get_json()["templates"][0]["id"]
    start_date = date.today() + timedelta(days=14)

    response = auth_client.post(f'/project-templates/{template_id}/use', json={
        "name": "Template Launch",
        "start_date": start_date.isoformat(),
    })

    assert response.status_code == 201
    data = response.get_json()
    assert data["name"] == "Template Launch"
    assert len(data["tasks"]) > 1
    assert any(task["dependencies"] for task in data["tasks"])
    assert data["tasks"][0]["due_date"] == (start_date + timedelta(days=1)).isoformat()

    with app.app_context():
        project = Project.query.filter_by(name="Template Launch").first()
        assert project is not None
        assert len(project.tasks) == len(data["tasks"])

def test_create_task_can_attach_existing_project(auth_client):
    project = auth_client.post('/projects', json={"name": "Existing Project"}).get_json()

    response = auth_client.post('/tasks', json={
        "title": "Project task",
        "project_id": project["id"],
    })

    assert response.status_code == 201
    data = response.get_json()
    assert data["project"] == "Existing Project"
    assert data["project_id"] == project["id"]

def test_regular_user_only_sees_projects_with_assigned_tasks(client, app):
    with app.app_context():
        regular = User(username="project_user", email="project_user@example.com", role="user")
        regular.set_password("password")
        admin = User(username="project_admin", email="project_admin@example.com", role="admin")
        admin.set_password("password")
        visible_project = Project(name="Visible Project")
        hidden_project = Project(name="Hidden Project")
        db.session.add_all([regular, admin, visible_project, hidden_project])
        db.session.flush()
        visible_task = Task(user_id=admin.id, title="Visible project task", project="Visible Project", project_id=visible_project.id)
        hidden_task = Task(user_id=admin.id, title="Hidden project task", project="Hidden Project", project_id=hidden_project.id)
        visible_task.assignees.append(regular)
        db.session.add_all([visible_task, hidden_task])
        db.session.commit()
        regular_id = regular.id

    with client.session_transaction() as sess:
        sess['user_id'] = regular_id

    response = client.get('/projects')

    assert response.status_code == 200
    projects = response.get_json()["projects"]
    assert [project["name"] for project in projects] == ["Visible Project"]
    assert projects[0]["tasks"][0]["title"] == "Visible project task"

def test_get_tasks(auth_client):
    auth_client.post('/tasks', json={"title": "Task 1"})
    auth_client.post('/tasks', json={"title": "Task 2"})
    
    response = auth_client.get('/tasks')
    assert response.status_code == 200
    data = response.get_json()
    assert len(data["tasks"]) == 2
    assert data["page"] == 1
    assert data["per_page"] == 50
    assert data["has_prev"] is False

def test_weekly_report_summarizes_created_completed_and_overdue(auth_client):
    today = date.today()
    done = auth_client.post('/tasks', json={"title": "Report done"}).get_json()
    auth_client.post('/tasks', json={"title": "Report overdue", "due_date": (today - timedelta(days=1)).isoformat()})
    auth_client.put(f'/tasks/{done["id"]}/complete')

    response = auth_client.get('/reports/weekly')

    assert response.status_code == 200
    data = response.get_json()
    assert data["summary"]["created"] >= 2
    assert data["summary"]["completed"] >= 1
    assert data["summary"]["overdue"] == 1
    assert "Ogólny" in data["by_project"]

def test_get_tasks_pagination_metadata(auth_client):
    for i in range(13):
        auth_client.post('/tasks', json={"title": f"Task {i}"})

    page_2 = auth_client.get('/tasks?page=2&per_page=5')
    assert page_2.status_code == 200
    page_2_data = page_2.get_json()
    assert page_2_data["total"] == 13
    assert page_2_data["page"] == 2
    assert page_2_data["pages"] == 3
    assert page_2_data["per_page"] == 5
    assert page_2_data["has_next"] is True
    assert page_2_data["has_prev"] is True
    assert len(page_2_data["tasks"]) == 5

    page_3 = auth_client.get('/tasks?page=3&per_page=5')
    assert page_3.status_code == 200
    page_3_data = page_3.get_json()
    assert page_3_data["has_next"] is False
    assert page_3_data["has_prev"] is True
    assert len(page_3_data["tasks"]) == 3

def test_get_tasks_per_page_has_upper_bound(auth_client):
    for i in range(10):
        auth_client.post('/tasks', json={"title": f"Capped {i}"})

    response = auth_client.get('/tasks?page=1&per_page=999')
    assert response.status_code == 200
    data = response.get_json()
    assert data["per_page"] == 100

def test_today_tasks_groups_visible_open_tasks_by_due_date(auth_client):
    today = date.today()
    auth_client.post('/tasks', json={"title": "Overdue", "due_date": (today - timedelta(days=1)).isoformat()})
    auth_client.post('/tasks', json={"title": "Today", "due_date": today.isoformat()})
    auth_client.post('/tasks', json={"title": "Soon", "due_date": (today + timedelta(days=3)).isoformat()})
    later = auth_client.post('/tasks', json={"title": "Later", "due_date": (today + timedelta(days=9)).isoformat()})
    auth_client.put(f'/tasks/{later.get_json()["id"]}/complete')

    response = auth_client.get('/tasks/today')

    assert response.status_code == 200
    data = response.get_json()
    assert [task["title"] for task in data["overdue"]] == ["Overdue"]
    assert [task["title"] for task in data["today"]] == ["Today"]
    assert [task["title"] for task in data["upcoming"]] == ["Soon"]
    assert data["counts"] == {
        "overdue": 1,
        "today": 1,
        "upcoming": 1,
        "total": 3,
        "blocked": 0,
        "ready": 3,
        "high_priority": 0,
    }

def test_quick_add_parses_project_assignee_due_date_and_priority(auth_client, app):
    with app.app_context():
        user = User(username="quickuser", email="quickuser@example.com", role="user")
        user.set_password("password")
        db.session.add(user)
        db.session.commit()

    response = auth_client.post('/tasks/quick-add', json={
        "text": "Napisać ofertę #Sprzedaz @quickuser jutro !high"
    })

    assert response.status_code == 201
    data = response.get_json()
    task = data["task"]
    assert task["title"] == "Napisać ofertę"
    assert task["project"] == "Sprzedaz"
    assert task["priority"] == "high"
    assert task["due_date"] == (date.today() + timedelta(days=1)).isoformat()
    assert task["assignees"][0]["username"] == "quickuser"

def test_today_tasks_regular_user_only_sees_assigned_tasks(client, app):
    today = date.today()
    with app.app_context():
        regular = User(username="today_user", email="today_user@example.com", role="user")
        regular.set_password("password")
        admin = User(username="today_admin", email="today_admin@example.com", role="admin")
        admin.set_password("password")
        db.session.add_all([regular, admin])
        db.session.commit()
        visible = Task(user_id=admin.id, title="Assigned today", due_date=today)
        hidden = Task(user_id=admin.id, title="Hidden today", due_date=today)
        visible.assignees.append(regular)
        db.session.add_all([visible, hidden])
        db.session.commit()
        regular_id = regular.id

    with client.session_transaction() as sess:
        sess['user_id'] = regular_id

    response = client.get('/tasks/today')

    assert response.status_code == 200
    assert [task["title"] for task in response.get_json()["today"]] == ["Assigned today"]

def test_task_dependency_blocks_completion_until_dependency_is_done(auth_client):
    blocked = auth_client.post('/tasks', json={"title": "Blocked task"}).get_json()
    blocker = auth_client.post('/tasks', json={"title": "Blocking task"}).get_json()

    dependency_response = auth_client.post(
        f'/tasks/{blocked["id"]}/dependencies',
        json={"depends_on_task_id": blocker["id"]},
    )
    assert dependency_response.status_code == 201
    dependency_data = dependency_response.get_json()
    assert dependency_data["is_blocked"] is True
    assert dependency_data["blocked_by"][0]["title"] == "Blocking task"

    blocked_completion = auth_client.put(f'/tasks/{blocked["id"]}/complete')
    assert blocked_completion.status_code == 409
    assert blocked_completion.get_json()["blocked_by"][0]["id"] == blocker["id"]

    auth_client.put(f'/tasks/{blocker["id"]}/complete')
    completed_response = auth_client.put(f'/tasks/{blocked["id"]}/complete')

    assert completed_response.status_code == 200
    assert completed_response.get_json()["completed"] is True

def test_task_completion_requires_completed_subtasks(auth_client):
    task = auth_client.post('/tasks', json={"title": "Parent task"}).get_json()
    subtask_response = auth_client.post(f'/tasks/{task["id"]}/subtasks', json={"title": "Open checklist item"})
    subtask = subtask_response.get_json()

    blocked_completion = auth_client.put(f'/tasks/{task["id"]}/complete')

    assert blocked_completion.status_code == 409
    blocked_payload = blocked_completion.get_json()
    assert blocked_payload["open_subtasks"][0]["id"] == subtask["id"]
    assert "podzadania" in blocked_payload["error"]

    auth_client.put(f'/subtasks/{subtask["id"]}/complete')
    completed_response = auth_client.put(f'/tasks/{task["id"]}/complete')

    assert completed_response.status_code == 200
    assert completed_response.get_json()["completed"] is True

def test_bulk_completion_requires_completed_subtasks(auth_client):
    task = auth_client.post('/tasks', json={"title": "Bulk parent task"}).get_json()
    auth_client.post(f'/tasks/{task["id"]}/subtasks', json={"title": "Still open"})

    response = auth_client.put('/tasks/bulk/complete', json={"task_ids": [task["id"]]})

    assert response.status_code == 409
    assert response.get_json()["blocked_tasks"][0]["id"] == task["id"]

    with auth_client.application.app_context():
        assert db.session.get(Task, task["id"]).completed is False

def test_blocked_tasks_endpoint_returns_visible_blocked_tasks(auth_client):
    blocked = auth_client.post('/tasks', json={"title": "Blocked overview"}).get_json()
    blocker = auth_client.post('/tasks', json={"title": "Open prerequisite"}).get_json()
    clear = auth_client.post('/tasks', json={"title": "Clear task"}).get_json()
    auth_client.post(
        f'/tasks/{blocked["id"]}/dependencies',
        json={"depends_on_task_id": blocker["id"]},
    )

    response = auth_client.get('/tasks/blocked')

    assert response.status_code == 200
    data = response.get_json()
    assert data["total"] == 1
    assert [task["id"] for task in data["tasks"]] == [blocked["id"]]
    assert clear["id"] not in [task["id"] for task in data["tasks"]]

def test_dependency_board_groups_blocked_blockers_and_ready_tasks(auth_client):
    blocked = auth_client.post('/tasks', json={"title": "Blocked board task", "priority": "high"}).get_json()
    blocker = auth_client.post('/tasks', json={"title": "Board blocker", "priority": "medium"}).get_json()
    ready = auth_client.post('/tasks', json={"title": "Ready board task", "priority": "low"}).get_json()
    done = auth_client.post('/tasks', json={"title": "Done board task"}).get_json()
    auth_client.post(
        f'/tasks/{blocked["id"]}/dependencies',
        json={"depends_on_task_id": blocker["id"]},
    )
    auth_client.put(f'/tasks/{done["id"]}/complete')

    response = auth_client.get('/tasks/dependency-board')

    assert response.status_code == 200
    data = response.get_json()
    assert data["counts"]["blocked"] == 1
    assert data["counts"]["blockers"] == 1
    assert data["counts"]["ready"] == 2
    assert data["blocked"][0]["id"] == blocked["id"]
    assert data["blockers"][0]["id"] == blocker["id"]
    assert data["blockers"][0]["blocking_count"] == 1
    assert {task["id"] for task in data["ready"]} == {blocker["id"], ready["id"]}

def test_dependency_cycle_is_rejected(auth_client):
    first = auth_client.post('/tasks', json={"title": "First"}).get_json()
    second = auth_client.post('/tasks', json={"title": "Second"}).get_json()
    auth_client.post(
        f'/tasks/{first["id"]}/dependencies',
        json={"depends_on_task_id": second["id"]},
    )

    response = auth_client.post(
        f'/tasks/{second["id"]}/dependencies',
        json={"depends_on_task_id": first["id"]},
    )

    assert response.status_code == 409
    assert "cykl" in response.get_json()["error"]

def test_dependency_delete_updates_task(auth_client, app):
    blocked = auth_client.post('/tasks', json={"title": "Remove dependency"}).get_json()
    blocker = auth_client.post('/tasks', json={"title": "No longer blocking"}).get_json()
    auth_client.post(
        f'/tasks/{blocked["id"]}/dependencies',
        json={"depends_on_task_id": blocker["id"]},
    )

    with app.app_context():
        dependency_id = TaskDependency.query.filter_by(task_id=blocked["id"]).first().id

    response = auth_client.delete(f'/dependencies/{dependency_id}')

    assert response.status_code == 200
    data = response.get_json()
    assert data["dependencies"] == []
    assert data["is_blocked"] is False

def test_create_task_with_assignees(auth_client, app):
    with app.app_context():
        user = User(username="assigned", email="assigned@example.com", role="user")
        user.set_password("password")
        from models import db
        db.session.add(user)
        db.session.commit()
        user_id = user.id

    response = auth_client.post('/tasks', json={
        "title": "Assigned Task",
        "assignee_ids": [user_id]
    })

    assert response.status_code == 201
    data = response.get_json()
    assert data["assignees"][0]["id"] == user_id

    with app.app_context():
        notification = Notification.query.filter_by(user_id=user_id, type="assignment").first()
        assert notification is not None
        assert notification.task_id == data["id"]

def test_notifications_can_be_listed_and_marked_read(auth_client, app):
    with app.app_context():
        user = User(username="notify_user", email="notify@example.com", role="user")
        user.set_password("password")
        db.session.add(user)
        db.session.commit()
        user_id = user.id

    auth_client.post('/tasks', json={"title": "Notify task", "assignee_ids": [user_id]})

    with auth_client.session_transaction() as sess:
        sess['user_id'] = user_id

    list_response = auth_client.get('/notifications')
    assert list_response.status_code == 200
    payload = list_response.get_json()
    assert payload["unread_count"] == 1
    notification_id = payload["notifications"][0]["id"]
    assert payload["notifications"][0]["read"] is False

    read_response = auth_client.post(f'/notifications/{notification_id}/read')
    assert read_response.status_code == 200
    assert read_response.get_json()["read"] is True

    list_after_read = auth_client.get('/notifications')
    assert list_after_read.get_json()["unread_count"] == 0

def test_completion_creates_unblocked_notification_for_assignee(client, app):
    with app.app_context():
        admin = User(username="unblock_admin", email="unblock_admin@example.com", role="admin")
        admin.set_password("password")
        regular = User(username="unblock_user", email="unblock_user@example.com", role="user")
        regular.set_password("password")
        db.session.add_all([admin, regular])
        db.session.commit()
        admin_id = admin.id
        regular_id = regular.id

    with client.session_transaction() as sess:
        sess['user_id'] = admin_id

    blocked = client.post('/tasks', json={"title": "Blocked for notify", "assignee_ids": [regular_id]}).get_json()
    blocker = client.post('/tasks', json={"title": "Blocker for notify"}).get_json()
    client.post(f'/tasks/{blocked["id"]}/dependencies', json={"depends_on_task_id": blocker["id"]})

    response = client.put(f'/tasks/{blocker["id"]}/complete')
    assert response.status_code == 200

    with app.app_context():
        notification = Notification.query.filter_by(user_id=regular_id, type="unblocked").first()
        assert notification is not None
        assert notification.task_id == blocked["id"]

def test_regular_user_only_sees_assigned_tasks(client, app):
    with app.app_context():
        from models import db
        user = User(username="regular", email="regular@example.com", role="user")
        user.set_password("password")
        owner = User(username="owner", email="owner@example.com", role="admin")
        owner.set_password("password")
        db.session.add_all([user, owner])
        db.session.commit()
        assigned_task = Task(user_id=owner.id, title="Visible")
        hidden_task = Task(user_id=owner.id, title="Hidden")
        assigned_task.assignees.append(user)
        db.session.add_all([assigned_task, hidden_task])
        db.session.commit()
        user_id = user.id

    with client.session_transaction() as sess:
        sess['user_id'] = user_id

    response = client.get('/tasks')

    assert response.status_code == 200
    data = response.get_json()
    assert [task["title"] for task in data["tasks"]] == ["Visible"]

def test_regular_user_cannot_create_task(user_client):
    response = user_client.post('/tasks', json={"title": "Nope"})
    assert response.status_code == 403

def test_admin_can_create_user(auth_client, app):
    response = auth_client.post('/users', json={
        "username": "created_by_admin",
        "password": "password123",
        "email": "created_by_admin@example.com",
        "role": "admin",
    })

    assert response.status_code == 201
    data = response.get_json()
    assert data["user"]["username"] == "created_by_admin"
    assert data["user"]["role"] == "admin"

    with app.app_context():
        created = User.query.filter_by(username="created_by_admin").first()
        assert created is not None
        assert created.check_password("password123")

def test_regular_user_cannot_manage_users(user_client):
    create_response = user_client.post('/users', json={
        "username": "blocked",
        "password": "password123",
        "email": "blocked@example.com",
    })
    delete_response = user_client.delete('/users/1')

    assert create_response.status_code == 403
    assert delete_response.status_code == 403

def test_admin_can_delete_user(auth_client, app):
    with app.app_context():
        from models import db
        target = User(username="delete_me", email="delete_me@example.com", role="user")
        target.set_password("password")
        db.session.add(target)
        db.session.commit()
        target_id = target.id

    response = auth_client.delete(f'/users/{target_id}')

    assert response.status_code == 200
    with app.app_context():
        assert db.session.get(User, target_id) is None

def test_admin_cannot_delete_self_or_last_admin(auth_client, app):
    with app.app_context():
        admin = User.query.filter_by(username="admin").first()
        admin_id = admin.id

    delete_response = auth_client.delete(f'/users/{admin_id}')
    role_response = auth_client.put(f'/users/{admin_id}/role', json={"role": "user"})

    assert delete_response.status_code == 400
    assert role_response.status_code == 400

def test_regular_user_cannot_update_or_delete_task(client, app):
    with app.app_context():
        from models import db
        admin = User(username="admin_ops", email="admin_ops@example.com", role="admin")
        admin.set_password("password")
        regular = User(username="regular_ops", email="regular_ops@example.com", role="user")
        regular.set_password("password")
        db.session.add_all([admin, regular])
        db.session.commit()
        task = Task(user_id=admin.id, title="Admin task")
        task.assignees.append(regular)
        db.session.add(task)
        db.session.commit()
        regular_id = regular.id
        task_id = task.id

    with client.session_transaction() as sess:
        sess['user_id'] = regular_id

    update_response = client.put(f'/tasks/{task_id}', json={"title": "Changed"})
    delete_response = client.delete(f'/tasks/{task_id}')

    assert update_response.status_code == 403
    assert delete_response.status_code == 403

def test_regular_user_can_complete_assigned_task(client, app):
    with app.app_context():
        from models import db
        admin = User(username="admin_complete", email="admin_complete@example.com", role="admin")
        admin.set_password("password")
        regular = User(username="regular_complete", email="regular_complete@example.com", role="user")
        regular.set_password("password")
        db.session.add_all([admin, regular])
        db.session.commit()
        task = Task(user_id=admin.id, title="Complete me")
        task.assignees.append(regular)
        db.session.add(task)
        db.session.commit()
        regular_id = regular.id
        task_id = task.id

    with client.session_transaction() as sess:
        sess['user_id'] = regular_id

    response = client.put(f'/tasks/{task_id}/complete')
    assert response.status_code == 200
    assert response.get_json()["completed"] is True

def test_regular_user_can_mark_assigned_task_in_progress(client, app, monkeypatch):
    monkeypatch.setattr("routes.tasks.send_email", lambda *args, **kwargs: True)

    with app.app_context():
        admin = User(username="admin_start", email="admin_start@example.com", role="admin")
        admin.set_password("password")
        regular = User(username="regular_start", email="regular_start@example.com", role="user")
        regular.set_password("password")
        db.session.add_all([admin, regular])
        db.session.commit()
        task = Task(user_id=admin.id, title="Start me")
        task.assignees.append(regular)
        db.session.add(task)
        db.session.commit()
        regular_id = regular.id
        task_id = task.id

    with client.session_transaction() as sess:
        sess['user_id'] = regular_id

    response = client.put(f'/tasks/{task_id}', json={"status": "in_progress", "completed": False})

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["status"] == "in_progress"
    assert payload["completed"] is False

    with app.app_context():
        saved_task = db.session.get(Task, task_id)
        assert saved_task.status == "in_progress"
        assert saved_task.completed is False

def test_regular_user_cannot_manage_assigned_task_subtasks(client, app):
    with app.app_context():
        admin = User(username="admin_subtasks", email="admin_subtasks@example.com", role="admin")
        admin.set_password("password")
        regular = User(username="regular_subtasks", email="regular_subtasks@example.com", role="user")
        regular.set_password("password")
        db.session.add_all([admin, regular])
        db.session.commit()
        task = Task(user_id=admin.id, title="Checklist")
        task.assignees.append(regular)
        db.session.add(task)
        db.session.flush()
        subtask = Subtask(task_id=task.id, title="Manager-owned item")
        db.session.add(subtask)
        db.session.commit()
        regular_id = regular.id
        task_id = task.id
        subtask_id = subtask.id

    with client.session_transaction() as sess:
        sess['user_id'] = regular_id

    add_response = client.post(f'/tasks/{task_id}/subtasks', json={"title": "User item"})
    toggle_response = client.put(f'/subtasks/{subtask_id}/complete')
    delete_response = client.delete(f'/subtasks/{subtask_id}')

    assert add_response.status_code == 403
    assert toggle_response.status_code == 403
    assert delete_response.status_code == 403

    with app.app_context():
        saved_task = db.session.get(Task, task_id)
        saved_subtask = db.session.get(Subtask, subtask_id)
        assert [item.title for item in saved_task.subtasks] == ["Manager-owned item"]
        assert saved_subtask.completed is False

def test_admin_can_unassign_task_user(auth_client, app):
    with app.app_context():
        regular = User(username="assigned_user", email="assigned_user@example.com", role="user")
        regular.set_password("password")
        db.session.add(regular)
        db.session.commit()
        regular_id = regular.id

    task = auth_client.post('/tasks', json={"title": "Unassign me", "assignee_ids": [regular_id]}).get_json()

    response = auth_client.put(f'/tasks/{task["id"]}', json={"assignee_ids": []})

    assert response.status_code == 200
    assert response.get_json()["assignees"] == []

    with app.app_context():
        saved_task = db.session.get(Task, task["id"])
        assert saved_task.assignees == []

def test_regular_user_cannot_comment_unassigned_task(client, app):
    with app.app_context():
        admin = User(username="admin_comment", email="admin_comment@example.com", role="admin")
        admin.set_password("password")
        regular = User(username="regular_comment", email="regular_comment@example.com", role="user")
        regular.set_password("password")
        db.session.add_all([admin, regular])
        db.session.commit()
        task = Task(user_id=admin.id, title="Private comment task")
        db.session.add(task)
        db.session.commit()
        regular_id = regular.id
        task_id = task.id

    with client.session_transaction() as sess:
        sess['user_id'] = regular_id

    response = client.post(f'/tasks/{task_id}/comments', json={"text": "Should not appear"})

    assert response.status_code == 403
    with app.app_context():
        assert db.session.get(Task, task_id).comments == []

def test_comment_mentions_emit_event_and_activity(auth_client, app, monkeypatch):
    with app.app_context():
        mentioned = User(username="mentioned_user", email="mentioned@example.com", role="user")
        mentioned.set_password("password")
        db.session.add(mentioned)
        db.session.commit()
        mentioned_id = mentioned.id

    task = auth_client.post('/tasks', json={"title": "Mention target"}).get_json()
    emitted = []

    def fake_emit(event_name, payload):
        emitted.append({"event_name": event_name, "payload": payload})

    monkeypatch.setattr("routes.tasks.socketio.emit", fake_emit)

    response = auth_client.post(f'/tasks/{task["id"]}/comments', json={"text": "@mentioned_user zerknij proszę"})

    assert response.status_code == 201
    task_event = next(event for event in emitted if event["event_name"] == "task_action")
    notification_event = next(event for event in emitted if event["event_name"] == "notification")
    assert task_event["payload"]["action"] == "mentioned"
    assert task_event["payload"]["mentioned_usernames"] == ["mentioned_user"]
    assert notification_event["payload"]["type"] == "mention"

    with app.app_context():
        mention_log = ActivityLog.query.filter_by(user_id=mentioned_id, action="mentioned").first()
        assert mention_log is not None
        assert mention_log.details["by"] == "admin"
        notification = Notification.query.filter_by(user_id=mentioned_id, type="mention").first()
        assert notification is not None
        assert notification.task_id == task["id"]

def test_regular_user_cannot_tag_unassigned_task(client, app):
    with app.app_context():
        admin = User(username="admin_tag", email="admin_tag@example.com", role="admin")
        admin.set_password("password")
        regular = User(username="regular_tag", email="regular_tag@example.com", role="user")
        regular.set_password("password")
        db.session.add_all([admin, regular])
        db.session.commit()
        task = Task(user_id=admin.id, title="Private tag task")
        tag = Tag(user_id=regular.id, name="Mine", color="#3b82f6")
        db.session.add_all([task, tag])
        db.session.commit()
        regular_id = regular.id
        task_id = task.id
        tag_id = tag.id

    with client.session_transaction() as sess:
        sess['user_id'] = regular_id

    response = client.post(f'/tasks/{task_id}/tags/{tag_id}')

    assert response.status_code == 403
    with app.app_context():
        assert db.session.get(Task, task_id).tags == []

def test_regular_user_cannot_use_another_users_tag_on_assigned_task(client, app):
    with app.app_context():
        admin = User(username="admin_other_tag", email="admin_other_tag@example.com", role="admin")
        admin.set_password("password")
        regular = User(username="regular_other_tag", email="regular_other_tag@example.com", role="user")
        regular.set_password("password")
        other = User(username="other_tag_owner", email="other_tag_owner@example.com", role="user")
        other.set_password("password")
        db.session.add_all([admin, regular, other])
        db.session.commit()
        task = Task(user_id=admin.id, title="Assigned private tag task")
        db.session.add(task)
        task.assignees.append(regular)
        tag = Tag(user_id=other.id, name="Other", color="#ef4444")
        db.session.add(tag)
        db.session.commit()
        regular_id = regular.id
        task_id = task.id
        tag_id = tag.id

    with client.session_transaction() as sess:
        sess['user_id'] = regular_id

    response = client.post(f'/tasks/{task_id}/tags/{tag_id}')

    assert response.status_code == 404
    with app.app_context():
        assert db.session.get(Task, task_id).tags == []

def test_create_task_emits_structured_socket_event(auth_client, monkeypatch):
    emitted = {}

    def fake_emit(event_name, payload):
        emitted["event_name"] = event_name
        emitted["payload"] = payload

    monkeypatch.setattr("routes.tasks.socketio.emit", fake_emit)

    response = auth_client.post('/tasks', json={"title": "Socket Payload Task"})

    assert response.status_code == 201
    assert emitted["event_name"] == "task_action"
    assert emitted["payload"]["action"] == "created"
    assert emitted["payload"]["task_id"] == response.get_json()["id"]

def test_task_activity_includes_created_and_updated_events(auth_client):
    created = auth_client.post('/tasks', json={"title": "Activity Task"}).get_json()
    auth_client.put(f'/tasks/{created["id"]}', json={"title": "Activity Task Updated", "priority": "high"})

    response = auth_client.get(f'/tasks/{created["id"]}/activity')

    assert response.status_code == 200
    activity = response.get_json()["activity"]
    assert [item["action"] for item in activity] == ["updated", "created"]
    assert activity[0]["details"]["changes"]["title"]["from"] == "Activity Task"
    assert activity[0]["details"]["changes"]["title"]["to"] == "Activity Task Updated"
    assert activity[0]["username"] == "admin"

def test_delete_task_emits_snapshot_event(auth_client, monkeypatch):
    created = auth_client.post('/tasks', json={"title": "Delete me"})
    task_id = created.get_json()["id"]

    emitted = {}

    def fake_emit(event_name, payload):
        emitted["event_name"] = event_name
        emitted["payload"] = payload

    monkeypatch.setattr("routes.tasks.socketio.emit", fake_emit)

    deleted = auth_client.delete(f'/tasks/{task_id}')
    assert deleted.status_code == 200
    assert emitted["event_name"] == "task_action"
    assert emitted["payload"]["action"] == "deleted"
    assert emitted["payload"]["task_id"] == task_id
    assert emitted["payload"]["task"]["title"] == "Delete me"

def test_bulk_complete_emits_socket_event(auth_client, monkeypatch):
    first = auth_client.post('/tasks', json={"title": "Bulk complete 1"}).get_json()
    second = auth_client.post('/tasks', json={"title": "Bulk complete 2"}).get_json()
    emitted = {}

    def fake_emit(event_name, payload):
        emitted["event_name"] = event_name
        emitted["payload"] = payload

    monkeypatch.setattr("routes.tasks.socketio.emit", fake_emit)

    response = auth_client.put('/tasks/bulk/complete', json={"task_ids": [first["id"], second["id"]]})

    assert response.status_code == 200
    assert emitted["event_name"] == "task_action"
    assert emitted["payload"]["action"] == "bulk_completed"
    assert emitted["payload"]["task_ids"] == [first["id"], second["id"]]

def test_bulk_update_emits_socket_event(auth_client, monkeypatch):
    task = auth_client.post('/tasks', json={"title": "Bulk update"}).get_json()
    emitted = {}

    def fake_emit(event_name, payload):
        emitted["event_name"] = event_name
        emitted["payload"] = payload

    monkeypatch.setattr("routes.tasks.socketio.emit", fake_emit)

    response = auth_client.put('/tasks/bulk/update', json={
        "task_ids": [task["id"]],
        "updates": {"priority": "high", "status": "in_progress"},
    })

    assert response.status_code == 200
    assert emitted["event_name"] == "task_action"
    assert emitted["payload"]["action"] == "bulk_updated"
    assert emitted["payload"]["task_ids"] == [task["id"]]

def test_bulk_delete_emits_socket_event(auth_client, monkeypatch):
    task = auth_client.post('/tasks', json={"title": "Bulk delete"}).get_json()
    emitted = {}

    def fake_emit(event_name, payload):
        emitted["event_name"] = event_name
        emitted["payload"] = payload

    monkeypatch.setattr("routes.tasks.socketio.emit", fake_emit)

    response = auth_client.delete('/tasks/bulk/delete', json={"task_ids": [task["id"]]})

    assert response.status_code == 200
    assert emitted["event_name"] == "task_action"
    assert emitted["payload"]["action"] == "bulk_deleted"
    assert emitted["payload"]["task_ids"] == [task["id"]]


def test_normalize_database_uri_uses_psycopg_driver():
    from config import normalize_database_uri, parse_cors_origins

    assert normalize_database_uri("postgres://user:pass@host/db") == "postgresql+psycopg://user:pass@host/db"
    assert normalize_database_uri("postgresql://user:pass@host/db") == "postgresql+psycopg://user:pass@host/db"
    assert normalize_database_uri("postgresql+psycopg://user:pass@host/db") == "postgresql+psycopg://user:pass@host/db"
    assert normalize_database_uri("sqlite:///tmp.db") == "sqlite:///tmp.db"
    assert parse_cors_origins("https://app.example.com, http://localhost:3000,") == [
        "https://app.example.com",
        "http://localhost:3000",
    ]


def test_migration_upgrade_smoke_fresh_sqlite(tmp_path, monkeypatch):
    db_path = tmp_path / "migration-smoke.db"
    db_uri = f"sqlite:///{db_path.as_posix()}"
    from app import create_app
    from config import Config

    class MigrationSmokeConfig(Config):
        SQLALCHEMY_DATABASE_URI = db_uri
        SECRET_KEY = "test-secret-key"
        ENABLE_SCHEDULER = False

    app = create_app(MigrationSmokeConfig)
    runner = app.test_cli_runner()
    result = runner.invoke(args=["db", "upgrade"])

    assert result.exit_code == 0, result.output

    with sqlite3.connect(db_path) as conn:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        task_columns = {row[1] for row in conn.execute("PRAGMA table_info(task)")}
        user_columns = {row[1] for row in conn.execute("PRAGMA table_info(user)")}

    assert "user" in tables
    assert "task" in tables
    assert "task_assignees" in tables
    assert "project" in tables
    assert "notification" in tables
    assert "status" in task_columns
    assert "project_id" in task_columns
    assert "terms_accepted" in user_columns
    assert "privacy_accepted" in user_columns
    assert "marketing_consent" in user_columns
