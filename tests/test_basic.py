import sqlite3

from models import User, Task

def test_health_check(client):
    response = client.get('/health')
    assert response.status_code == 200
    assert response.get_json() == {"status": "healthy"}

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
    assert "status" in task_columns
    assert "terms_accepted" in user_columns
    assert "privacy_accepted" in user_columns
    assert "marketing_consent" in user_columns
