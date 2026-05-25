from __future__ import annotations

from models import Project, ProjectTemplate, Team, User, db
from utils.template_service import seed_team_templates


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
    seed_team_templates(team.id, created_by_id=user.id)
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


def test_project_templates_are_loaded_from_current_team(client, app):
    with app.app_context():
        team = make_team("Templates Team")
        manager = make_manager("templates_manager", team)
        db.session.commit()
        team_id = team.id
        manager_id = manager.id

    with app.app_context():
        login_as(client, db.session.get(User, manager_id))

    response = client.get("/project-templates")

    assert response.status_code == 200
    templates = response.get_json()["templates"]
    assert len(templates) == 3
    with app.app_context():
        db_ids = {template.id for template in ProjectTemplate.query.filter_by(team_id=team_id).all()}
    assert {template["id"] for template in templates} == db_ids


def test_using_project_template_requires_current_team_template(client, app):
    with app.app_context():
        team_a = make_team("Template Use A")
        team_b = make_team("Template Use B")
        manager_a = make_manager("template_use_manager_a", team_a)
        manager_b = make_manager("template_use_manager_b", team_b)
        db.session.commit()
        manager_a_id = manager_a.id
        manager_b_id = manager_b.id
        template_b_id = ProjectTemplate.query.filter_by(team_id=team_b.id).first().id

    with app.app_context():
        login_as(client, db.session.get(User, manager_a_id))
    rejected = client.post(f"/project-templates/{template_b_id}/use", json={"name": "Should fail"})
    assert rejected.status_code == 404

    own_templates = client.get("/project-templates").get_json()["templates"]
    accepted = client.post(
        f"/project-templates/{own_templates[0]['id']}/use",
        json={"name": "Own template project"},
    )
    assert accepted.status_code == 201
    assert accepted.get_json()["name"] == "Own template project"

    with app.app_context():
        login_as(client, db.session.get(User, manager_b_id))
    assert client.get("/projects").status_code == 200
