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
