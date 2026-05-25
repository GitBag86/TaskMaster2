from __future__ import annotations

from models import Comment, CustomField, Subtask, Tag, Task, Team, User, db


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


def seed_teams(app):
    with app.app_context():
        team_a = make_team("Nested A")
        team_b = make_team("Nested B")
        manager_a = make_user("nested_manager_a", team_a)
        manager_b = make_user("nested_manager_b", team_b)
        db.session.commit()
        return {
            "team_a_id": team_a.id,
            "team_b_id": team_b.id,
            "manager_a_id": manager_a.id,
            "manager_b_id": manager_b.id,
        }


def test_comment_and_subtask_are_stamped_with_parent_task_team(client, app):
    ids = seed_teams(app)
    with app.app_context():
        manager_a = db.session.get(User, ids["manager_a_id"])
        task = Task(user_id=manager_a.id, title="Nested parent", team_id=ids["team_a_id"])
        db.session.add(task)
        db.session.commit()
        task_id = task.id
        login_as(client, manager_a)

    comment_response = client.post(f"/tasks/{task_id}/comments", json={"text": "Team local"})
    subtask_response = client.post(f"/tasks/{task_id}/subtasks", json={"title": "Team local"})

    assert comment_response.status_code == 201
    assert subtask_response.status_code == 201
    with app.app_context():
        assert db.session.get(Comment, comment_response.get_json()["id"]).team_id == ids["team_a_id"]
        assert db.session.get(Subtask, subtask_response.get_json()["id"]).team_id == ids["team_a_id"]


def test_cross_team_comment_and_subtask_parent_return_404(client, app):
    ids = seed_teams(app)
    with app.app_context():
        manager_a = db.session.get(User, ids["manager_a_id"])
        manager_b = db.session.get(User, ids["manager_b_id"])
        task = Task(user_id=manager_a.id, title="A only", team_id=ids["team_a_id"])
        db.session.add(task)
        db.session.commit()
        task_id = task.id
        login_as(client, manager_b)

    comment_response = client.post(f"/tasks/{task_id}/comments", json={"text": "No leak"})
    subtask_response = client.post(f"/tasks/{task_id}/subtasks", json={"title": "No leak"})

    assert comment_response.status_code == 404
    assert subtask_response.status_code == 404


def test_custom_field_parent_task_is_team_scoped(client, app):
    ids = seed_teams(app)
    with app.app_context():
        manager_a = db.session.get(User, ids["manager_a_id"])
        manager_b = db.session.get(User, ids["manager_b_id"])
        task = Task(user_id=manager_a.id, title="Field parent", team_id=ids["team_a_id"])
        db.session.add(task)
        db.session.commit()
        task_id = task.id
        login_as(client, manager_b)

    rejected = client.post(f"/tasks/{task_id}/fields", json={
        "field_name": "Budget",
        "field_value": "100",
    })
    assert rejected.status_code == 404

    with app.app_context():
        manager_a = db.session.get(User, ids["manager_a_id"])
        login_as(client, manager_a)
    accepted = client.post(f"/tasks/{task_id}/fields", json={
        "field_name": "Budget",
        "field_value": "100",
    })
    assert accepted.status_code == 201
    with app.app_context():
        field = CustomField.query.filter_by(task_id=task_id).one()
        assert field.team_id == ids["team_a_id"]


def test_tags_are_listed_per_team_and_allow_same_name(client, app):
    ids = seed_teams(app)
    with app.app_context():
        manager_a = db.session.get(User, ids["manager_a_id"])
        manager_b = db.session.get(User, ids["manager_b_id"])
        login_as(client, manager_a)

    tag_a = client.post("/tags", json={"name": "pilne", "color": "#ef4444"})
    assert tag_a.status_code == 201

    with app.app_context():
        manager_b = db.session.get(User, ids["manager_b_id"])
        login_as(client, manager_b)
    tag_b = client.post("/tags", json={"name": "pilne", "color": "#3b82f6"})
    assert tag_b.status_code == 201

    list_b = client.get("/tags")
    assert [tag["id"] for tag in list_b.get_json()["tags"]] == [tag_b.get_json()["id"]]

    with app.app_context():
        manager_a = db.session.get(User, ids["manager_a_id"])
        login_as(client, manager_a)
    list_a = client.get("/tags")
    assert [tag["id"] for tag in list_a.get_json()["tags"]] == [tag_a.get_json()["id"]]
    assert Tag.query.filter_by(name="pilne").count() == 2
