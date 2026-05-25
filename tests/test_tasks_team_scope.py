from __future__ import annotations

from models import Task, Team, User, db


def make_team(name: str) -> Team:
    team = Team(name=name, slug=name.lower().replace(" ", "-"))
    db.session.add(team)
    db.session.flush()
    return team


def make_user(username: str, team: Team, role: str = "manager") -> User:
    user = User(
        username=username,
        email=f"{username}@example.com",
        role=role,
        team_id=team.id,
        session_version=0,
    )
    user.set_password("password")
    db.session.add(user)
    db.session.flush()
    return user


def login_as(client, user: User) -> None:
    with client.session_transaction() as sess:
        sess["user_id"] = user.id
        sess["team_id"] = user.team_id
        sess["role"] = user.role
        sess["session_version"] = user.session_version


def seed_two_team_managers(app):
    with app.app_context():
        team_a = make_team("Team A")
        team_b = make_team("Team B")
        manager_a = make_user("manager_a", team_a)
        manager_b = make_user("manager_b", team_b)
        user_b = make_user("user_b", team_b, role="user")
        db.session.commit()
        return {
            "team_a_id": team_a.id,
            "team_b_id": team_b.id,
            "manager_a_id": manager_a.id,
            "manager_b_id": manager_b.id,
            "user_b_id": user_b.id,
        }


def test_manager_creates_task_stamped_with_current_team(client, app):
    ids = seed_two_team_managers(app)
    with app.app_context():
        manager_a = db.session.get(User, ids["manager_a_id"])
        login_as(client, manager_a)

    response = client.post("/tasks", json={"title": "Scoped task"})

    assert response.status_code == 201
    task_id = response.get_json()["id"]
    with app.app_context():
        task = db.session.get(Task, task_id)
        assert task.team_id == ids["team_a_id"]


def test_cross_team_task_read_update_delete_return_404(client, app):
    ids = seed_two_team_managers(app)
    with app.app_context():
        manager_a = db.session.get(User, ids["manager_a_id"])
        manager_b = db.session.get(User, ids["manager_b_id"])
        task = Task(
            user_id=manager_a.id,
            title="A private task",
            team_id=ids["team_a_id"],
        )
        db.session.add(task)
        db.session.commit()
        task_id = task.id
        login_as(client, manager_b)

    assert client.get(f"/tasks/{task_id}/dependencies").status_code == 404
    assert client.put(f"/tasks/{task_id}", json={"title": "Nope"}).status_code == 404
    assert client.delete(f"/tasks/{task_id}").status_code == 404


def test_cross_team_assignee_reference_rejected_with_code(client, app):
    ids = seed_two_team_managers(app)
    with app.app_context():
        manager_a = db.session.get(User, ids["manager_a_id"])
        login_as(client, manager_a)

    response = client.post("/tasks", json={
        "title": "Bad assignee",
        "assignee_ids": [ids["user_b_id"]],
    })

    assert response.status_code == 400
    assert response.get_json()["code"] == "cross_team_reference"


def test_cross_team_dependency_rejected_before_cycle_check(client, app):
    ids = seed_two_team_managers(app)
    with app.app_context():
        manager_a = db.session.get(User, ids["manager_a_id"])
        manager_b = db.session.get(User, ids["manager_b_id"])
        task_a = Task(user_id=manager_a.id, title="Task A", team_id=ids["team_a_id"])
        task_b = Task(user_id=manager_b.id, title="Task B", team_id=ids["team_b_id"])
        db.session.add_all([task_a, task_b])
        db.session.commit()
        task_a_id = task_a.id
        task_b_id = task_b.id
        login_as(client, manager_a)

    response = client.post(
        f"/tasks/{task_a_id}/dependencies",
        json={"depends_on_task_id": task_b_id},
    )

    assert response.status_code == 400
    assert response.get_json()["code"] == "cross_team_reference"


def test_quick_add_keeps_cross_team_mention_token_literal(client, app):
    ids = seed_two_team_managers(app)
    with app.app_context():
        manager_a = db.session.get(User, ids["manager_a_id"])
        login_as(client, manager_a)

    response = client.post("/tasks/quick-add", json={"text": "@user_b"})

    assert response.status_code == 201
    payload = response.get_json()
    assert payload["task"]["title"] == "@user_b"
    assert payload["task"]["assignees"] == []
