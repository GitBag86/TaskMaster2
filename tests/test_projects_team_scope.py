from __future__ import annotations

from models import Project, Team, User, db


def make_team(name: str) -> Team:
    team = Team(name=name, slug=name.lower().replace(" ", "-"))
    db.session.add(team)
    db.session.flush()
    return team


def make_manager(username: str, team: Team) -> User:
    user = User(
        username=username,
        email=f"{username}@example.com",
        role="manager",
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


def test_same_project_name_allowed_in_different_teams(client, app):
    with app.app_context():
        team_a = make_team("Project A")
        team_b = make_team("Project B")
        manager_a = make_manager("project_manager_a", team_a)
        manager_b = make_manager("project_manager_b", team_b)
        db.session.commit()
        team_a_id = team_a.id
        team_b_id = team_b.id
        manager_a_id = manager_a.id
        manager_b_id = manager_b.id

    with app.app_context():
        login_as(client, db.session.get(User, manager_a_id))
    first = client.post("/projects", json={"name": "Shared Name"})
    assert first.status_code == 201

    with app.app_context():
        login_as(client, db.session.get(User, manager_b_id))
    second = client.post("/projects", json={"name": "Shared Name"})
    assert second.status_code == 201

    with app.app_context():
        projects = Project.query.filter_by(name="Shared Name").all()
        assert len(projects) == 2
        assert {project.team_id for project in projects} == {team_a_id, team_b_id}


def test_cross_team_project_member_reference_rejected(client, app):
    with app.app_context():
        team_a = make_team("Members A")
        team_b = make_team("Members B")
        manager_a = make_manager("members_manager_a", team_a)
        outsider = User(
            username="outsider_user",
            email="outsider@example.com",
            role="user",
            team_id=team_b.id,
        )
        outsider.set_password("password")
        db.session.add(outsider)
        db.session.commit()
        manager_a_id = manager_a.id
        outsider_id = outsider.id

    with app.app_context():
        login_as(client, db.session.get(User, manager_a_id))

    response = client.post("/projects", json={
        "name": "Invalid member",
        "member_ids": [outsider_id],
    })

    assert response.status_code == 400
    assert response.get_json()["code"] == "cross_team_reference"
