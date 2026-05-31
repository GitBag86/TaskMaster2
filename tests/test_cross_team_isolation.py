from datetime import date

import pytest

from models import (
    ActivityLog,
    CustomField,
    Notification,
    Project,
    SavedFilter,
    Subtask,
    Tag,
    Task,
    TaskDependency,
    TaskTemplate,
    Team,
    User,
    db,
)


def make_team(name):
    team = Team(name=name, slug=name.lower().replace(" ", "-"))
    db.session.add(team)
    db.session.flush()
    return team


def make_user(username, team=None, role="manager"):
    user = User(
        username=username,
        email=f"{username}@example.com",
        role=role,
        team_id=team.id if team else None,
    )
    user.set_password("password")
    db.session.add(user)
    db.session.flush()
    return user


def login_as(client, user):
    with client.session_transaction() as sess:
        sess["user_id"] = user.id
        sess["team_id"] = user.team_id
        sess["role"] = user.role
        sess["session_version"] = user.session_version


def seed_team_resources(team, manager):
    project = Project(name="A Project", description="Only A", team_id=team.id, created_by_id=manager.id)
    tag = Tag(user_id=manager.id, team_id=team.id, name="A Tag")
    task = Task(
        user_id=manager.id,
        team_id=team.id,
        project_id=None,
        title="A Task",
        due_date=date.today(),
    )
    blocker = Task(user_id=manager.id, team_id=team.id, title="A Blocker")
    saved_filter = SavedFilter(user_id=manager.id, team_id=team.id, name="A Filter", filters={})
    task_template = TaskTemplate(
        user_id=manager.id,
        team_id=team.id,
        name="A Template",
        template_data={"title": "From A Template"},
    )
    notification = Notification(user_id=manager.id, team_id=team.id, type="info", message="A Notification")
    activity = ActivityLog(user_id=manager.id, team_id=team.id, action="created", details={"title": "A"})
    db.session.add_all([
        project,
        tag,
        task,
        blocker,
        saved_filter,
        task_template,
        notification,
        activity,
    ])
    db.session.flush()
    task.project_id = project.id
    task.project = project.name
    subtask = Subtask(task_id=task.id, team_id=team.id, title="A Subtask")
    dependency = TaskDependency(task_id=task.id, depends_on_task_id=blocker.id, team_id=team.id)
    custom_field = CustomField(
        user_id=manager.id,
        task_id=task.id,
        team_id=team.id,
        field_name="A Field",
        field_value="A Value",
    )
    db.session.add_all([subtask, dependency, custom_field])
    db.session.commit()
    return {
        "project_id": project.id,
        "tag_id": tag.id,
        "task_id": task.id,
        "blocker_id": blocker.id,
        "saved_filter_id": saved_filter.id,
        "task_template_id": task_template.id,
        "notification_id": notification.id,
        "subtask_id": subtask.id,
        "dependency_id": dependency.id,
        "custom_field_id": custom_field.id,
    }


@pytest.fixture
def isolation_context(client, app):
    with app.app_context():
        team_a = make_team("Team A")
        team_b = make_team("Team B")
        manager_a = make_user("manager_a_iso", team_a)
        manager_b = make_user("manager_b_iso", team_b)
        user_b = make_user("user_b_iso", team_b, role="user")
        super_admin = make_user("super_iso", role="super_admin")
        resource_ids = seed_team_resources(team_a, manager_a)
        db.session.commit()
        return {
            "manager_a_id": manager_a.id,
            "manager_b_id": manager_b.id,
            "user_b_id": user_b.id,
            "super_admin_id": super_admin.id,
            **resource_ids,
        }


def _request(client, method, path, **kwargs):
    return getattr(client, method.lower())(path, **kwargs)


TEAM_SCOPED_RESOURCE_ENDPOINTS = [
    ("GET", "/tasks/{task_id}/dependencies", None),
    ("POST", "/tasks/{task_id}/dependencies", {"depends_on_task_id": "{blocker_id}"}),
    ("PUT", "/tasks/{task_id}", {"title": "No leak"}),
    ("PUT", "/tasks/{task_id}/complete", None),
    ("DELETE", "/tasks/{task_id}", None),
    ("POST", "/tasks/{task_id}/comments", {"text": "No leak"}),
    ("GET", "/tasks/{task_id}/activity", None),
    ("POST", "/tasks/{task_id}/subtasks", {"title": "No leak"}),
    ("POST", "/tasks/{task_id}/fields", {"field_name": "No leak", "field_value": "x"}),
    ("POST", "/tasks/{task_id}/tags/{tag_id}", None),
    ("DELETE", "/tasks/{task_id}/tags/{tag_id}", None),
    ("DELETE", "/dependencies/{dependency_id}", None),
    ("PUT", "/subtasks/{subtask_id}/complete", None),
    ("DELETE", "/subtasks/{subtask_id}", None),
    ("PUT", "/projects/{project_id}", {"name": "No leak"}),
    ("GET", "/projects/{project_id}/completion", None),
    ("POST", "/projects/{project_id}/complete", None),
    ("DELETE", "/projects/{project_id}", None),
    ("DELETE", "/tags/{tag_id}", None),
    ("DELETE", "/filters/{saved_filter_id}", None),
    ("DELETE", "/templates/{task_template_id}", None),
    ("POST", "/templates/{task_template_id}/use", None),
    ("POST", "/notifications/{notification_id}/read", None),
]


def materialize(value, ids):
    if isinstance(value, dict):
        return {key: materialize(item, ids) for key, item in value.items()}
    if isinstance(value, str):
        return value.format(**ids)
    return value


@pytest.mark.parametrize("method,path_template,payload", TEAM_SCOPED_RESOURCE_ENDPOINTS)
def test_manager_from_other_team_gets_404_for_team_a_resource(client, app, isolation_context, method, path_template, payload):
    with app.app_context():
        manager_b = db.session.get(User, isolation_context["manager_b_id"])
        login_as(client, manager_b)

    path = path_template.format(**isolation_context)
    json_payload = materialize(payload, isolation_context) if payload is not None else None
    response = _request(client, method, path, json=json_payload) if json_payload is not None else _request(client, method, path)
    assert response.status_code == 404


LIST_ENDPOINTS = [
    ("GET", "/tasks", lambda data: data["tasks"]),
    ("GET", "/tasks/filter", lambda data: data["tasks"]),
    ("GET", "/tasks/today", lambda data: data["today"] + data["upcoming"] + data["overdue"]),
    ("GET", "/tasks/blocked", lambda data: data["tasks"]),
    ("GET", "/tasks/dependency-board", lambda data: data["blocked"] + data["blockers"] + data["ready"]),
    ("GET", "/tasks/by-project", lambda data: [task for tasks in data.values() for task in tasks]),
    ("GET", "/projects", lambda data: data["projects"]),
    ("GET", "/tags", lambda data: data["tags"]),
    ("GET", "/filters", lambda data: data["filters"]),
    ("GET", "/templates", lambda data: data["templates"]),
    ("GET", "/notifications", lambda data: data["notifications"]),
    ("GET", "/activity", lambda data: data["activity"]),
    ("GET", "/users", lambda data: data["users"]),
]


@pytest.mark.parametrize("method,path,extract_items", LIST_ENDPOINTS)
def test_manager_from_other_team_does_not_see_team_a_resources(client, app, isolation_context, method, path, extract_items):
    with app.app_context():
        manager_b = db.session.get(User, isolation_context["manager_b_id"])
        login_as(client, manager_b)

    response = _request(client, method, path)
    assert response.status_code == 200
    items = extract_items(response.get_json())
    serialized = str(items)
    assert "A Task" not in serialized
    assert "A Project" not in serialized
    assert "A Tag" not in serialized
    assert "A Filter" not in serialized
    assert "A Template" not in serialized
    assert "A Notification" not in serialized
    assert "manager_a_iso" not in serialized


def test_super_admin_standard_team_scoped_tasks_endpoint_is_empty(client, app, isolation_context):
    with app.app_context():
        super_admin = db.session.get(User, isolation_context["super_admin_id"])
        login_as(client, super_admin)

    response = client.get("/tasks")
    assert response.status_code == 200
    assert response.get_json()["tasks"] == []
