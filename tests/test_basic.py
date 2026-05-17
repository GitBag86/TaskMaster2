import pytest
from models import User, Task

def test_health_check(client):
    response = client.get('/health')
    assert response.status_code == 200
    assert response.get_json() == {"status": "healthy"}

def test_signup(client):
    response = client.post('/auth/signup', json={
        "username": "newuser",
        "password": "password123",
        "email": "newuser@example.com"
    })
    assert response.status_code == 201
    assert "user" in response.get_json()

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
