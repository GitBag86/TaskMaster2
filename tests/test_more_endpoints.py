from datetime import date, timedelta, datetime, timezone

from models import Project, Tag, Task, Team, User, db
from tests.test_basic import default_team_id


def test_get_users_lists_team_members(auth_client, app):
    with app.app_context():
        team_id = default_team_id(app)
        user = User(username="listable", email="listable@example.com", role="user", team_id=team_id)
        user.set_password("password")
        db.session.add(user)
        db.session.commit()

    response = auth_client.get("/users")
    assert response.status_code == 200
    data = response.get_json()
    usernames = [u["username"] for u in data["users"]]
    assert "admin" in usernames
    assert "listable" in usernames


def test_get_users_requires_admin(client, app):
    response = client.get("/users")
    assert response.status_code == 401


def test_get_dashboard_stats_returns_counts(auth_client, app):
    with app.app_context():
        team_id = default_team_id(app)
        for i in range(3):
            task = Task(
                title=f"Stat task {i}",
                user_id=User.query.filter_by(username="admin").first().id,
                team_id=team_id,
                completed=(i == 0),
                priority="high" if i == 1 else "medium",
                project="Stats",
            )
            db.session.add(task)
        db.session.commit()

    response = auth_client.get("/stats/dashboard")
    assert response.status_code == 200
    data = response.get_json()
    assert data["total"] >= 3
    assert data["completed"] >= 1
    assert data["pending"] >= 2
    assert "by_priority" in data
    assert "by_project" in data
    assert "Stats" in data["by_project"]


def test_get_dashboard_stats_requires_login(client):
    response = client.get("/stats/dashboard")
    assert response.status_code == 401


def test_filter_tasks_by_priority(auth_client, app):
    with app.app_context():
        team_id = default_team_id(app)
        admin = User.query.filter_by(username="admin").first()
        high = Task(title="High priority", user_id=admin.id, priority="high", team_id=team_id)
        low = Task(title="Low priority", user_id=admin.id, priority="low", team_id=team_id)
        db.session.add_all([high, low])
        db.session.commit()

    response = auth_client.get("/tasks/filter?priority=high")
    assert response.status_code == 200
    tasks = response.get_json()["tasks"]
    titles = [t["title"] for t in tasks]
    assert "High priority" in titles
    assert "Low priority" not in titles


def test_filter_tasks_by_completed(auth_client, app):
    with app.app_context():
        team_id = default_team_id(app)
        admin = User.query.filter_by(username="admin").first()
        done = Task(title="Done task", user_id=admin.id, completed=True, team_id=team_id)
        open_task = Task(title="Open task", user_id=admin.id, completed=False, team_id=team_id)
        db.session.add_all([done, open_task])
        db.session.commit()

    response = auth_client.get("/tasks/filter?completed=true")
    assert response.status_code == 200
    tasks = response.get_json()["tasks"]
    titles = [t["title"] for t in tasks]
    assert "Done task" in titles
    assert "Open task" not in titles


def test_tasks_by_project_groups_correctly(auth_client, app):
    with app.app_context():
        team_id = default_team_id(app)
        admin = User.query.filter_by(username="admin").first()
        project = Project(name="Grouped", team_id=team_id, created_by_id=admin.id)
        db.session.add(project)
        db.session.flush()
        task_a = Task(title="Task A", user_id=admin.id, project="Grouped", project_id=project.id, team_id=team_id)
        task_b = Task(title="Task B", user_id=admin.id, project="Grouped", project_id=project.id, team_id=team_id)
        db.session.add_all([task_a, task_b])
        db.session.commit()

    response = auth_client.get("/tasks/by-project")
    assert response.status_code == 200
    data = response.get_json()
    assert "Grouped" in data
    assert len(data["Grouped"]) == 2


def test_delete_tag_from_task_removes_association(auth_client, app):
    with app.app_context():
        team_id = default_team_id(app)
        admin = User.query.filter_by(username="admin").first()
        tag = Tag(name="removable", user_id=admin.id, team_id=team_id)
        task = Task(title="Tagged task", user_id=admin.id, team_id=team_id)
        task.tags.append(tag)
        db.session.add_all([tag, task])
        db.session.commit()
        task_id = task.id
        tag_id = tag.id

    response = auth_client.delete(f"/tasks/{task_id}/tags/{tag_id}")
    assert response.status_code == 200

    with app.app_context():
        task = db.session.get(Task, task_id)
        tag_ids = [t.id for t in task.tags]
        assert tag_id not in tag_ids


def test_delete_tag_from_other_users_tag_returns_404(auth_client, app):
    with app.app_context():
        team_id = default_team_id(app)
        admin = User.query.filter_by(username="admin").first()
        other = User(username="other_tagger", email="other_tagger@example.com", role="user", team_id=team_id)
        other.set_password("password")
        db.session.add(other)
        db.session.flush()
        tag = Tag(name="not_mine", user_id=other.id, team_id=team_id)
        task = Task(title="Others tag task", user_id=admin.id, team_id=team_id)
        task.tags.append(tag)
        db.session.add_all([tag, task])
        db.session.commit()
        task_id = task.id
        tag_id = tag.id

    response = auth_client.delete(f"/tasks/{task_id}/tags/{tag_id}")
    assert response.status_code == 404


def test_export_tasks_requires_admin(client, app):
    response = client.get("/tasks/export")
    assert response.status_code == 401


def test_export_tasks_returns_json_with_version_and_tasks(auth_client, app):
    with app.app_context():
        team_id = default_team_id(app)
        admin = User.query.filter_by(username="admin").first()
        task = Task(title="Exportable", user_id=admin.id, team_id=team_id)
        db.session.add(task)
        db.session.commit()

    response = auth_client.get("/tasks/export")
    assert response.status_code == 200
    data = response.get_json()
    assert data["version"] == "1.0"
    assert "exported_at" in data
    assert "tasks" in data
    titles = [t["title"] for t in data["tasks"]]
    assert "Exportable" in titles


def test_import_tasks_requires_valid_data(auth_client, app):
    response = auth_client.post("/tasks/import", json={})
    assert response.status_code == 400


def test_import_tasks_requires_manager(client, app):
    response = client.post("/tasks/import", json={"tasks": []})
    assert response.status_code == 401


def test_update_project_renames_and_updates(auth_client, app):
    with app.app_context():
        team_id = default_team_id(app)
        admin = User.query.filter_by(username="admin").first()
        project = Project(name="OriginalName", team_id=team_id, created_by_id=admin.id)
        db.session.add(project)
        db.session.flush()
        task = Task(title="In project", user_id=admin.id, project="OriginalName", project_id=project.id, team_id=team_id)
        db.session.add(task)
        db.session.commit()
        project_id = project.id
        task_id = task.id

    response = auth_client.put(f"/projects/{project_id}", json={
        "name": "RenamedProject",
        "description": "Updated description",
    })
    assert response.status_code == 200
    data = response.get_json()
    assert data["name"] == "RenamedProject"

    with app.app_context():
        project = db.session.get(Project, project_id)
        assert project.name == "RenamedProject"
        task = db.session.get(Task, task_id)
        assert task is not None
        assert task.project == "RenamedProject"


def test_update_project_requires_login(client, app):
    with app.app_context():
        team = Team(name="LoginTest", slug="logintest")
        db.session.add(team)
        db.session.flush()
        admin = User(username="login_admin", email="login_admin@example.com", role="manager", team_id=team.id)
        admin.set_password("password")
        db.session.add(admin)
        db.session.flush()
        project = Project(name="ManagerOnly", team_id=team.id, created_by_id=admin.id)
        db.session.add(project)
        db.session.commit()
        project_id = project.id

    response = client.put(f"/projects/{project_id}", json={"name": "Nope"})
    assert response.status_code == 401


def test_update_project_rejects_duplicate_name(auth_client, app):
    with app.app_context():
        team_id = default_team_id(app)
        admin = User.query.filter_by(username="admin").first()
        existing = Project(name="Existing", team_id=team_id, created_by_id=admin.id)
        target = Project(name="Target", team_id=team_id, created_by_id=admin.id)
        db.session.add_all([existing, target])
        db.session.commit()
        target_id = target.id

    response = auth_client.put(f"/projects/{target_id}", json={"name": "Existing"})
    assert response.status_code == 409
