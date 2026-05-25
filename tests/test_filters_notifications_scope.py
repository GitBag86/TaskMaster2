from __future__ import annotations

from datetime import date, timedelta

from models import ActivityLog, Notification, SavedFilter, Task, Team, User, db


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


def seed_two_teams(app):
    with app.app_context():
        team_a = make_team("Scope A")
        team_b = make_team("Scope B")
        manager_a = make_user("scope_manager_a", team_a)
        manager_b = make_user("scope_manager_b", team_b)
        db.session.commit()
        return {
            "team_a_id": team_a.id,
            "team_b_id": team_b.id,
            "manager_a_id": manager_a.id,
            "manager_b_id": manager_b.id,
        }


def test_saved_filters_are_scoped_to_current_team(client, app):
    ids = seed_two_teams(app)
    with app.app_context():
        manager_a = db.session.get(User, ids["manager_a_id"])
        manager_b = db.session.get(User, ids["manager_b_id"])
        filter_a = SavedFilter(
            user_id=manager_a.id,
            team_id=ids["team_a_id"],
            name="A filter",
            filters={"priority": "high"},
        )
        filter_b = SavedFilter(
            user_id=manager_b.id,
            team_id=ids["team_b_id"],
            name="B filter",
            filters={"priority": "low"},
        )
        db.session.add_all([filter_a, filter_b])
        db.session.commit()
        login_as(client, manager_a)

    response = client.get("/filters")
    assert response.status_code == 200
    assert [item["name"] for item in response.get_json()["filters"]] == ["A filter"]

    with app.app_context():
        manager_a = db.session.get(User, ids["manager_a_id"])
        filter_b_id = SavedFilter.query.filter_by(name="B filter").one().id
        login_as(client, manager_a)
    assert client.delete(f"/filters/{filter_b_id}").status_code == 404


def test_notifications_are_scoped_by_user_and_team(client, app):
    ids = seed_two_teams(app)
    with app.app_context():
        manager_a = db.session.get(User, ids["manager_a_id"])
        manager_b = db.session.get(User, ids["manager_b_id"])
        notification_a = Notification(
            user_id=manager_a.id,
            team_id=ids["team_a_id"],
            type="assignment",
            message="A notification",
        )
        notification_b = Notification(
            user_id=manager_a.id,
            team_id=ids["team_b_id"],
            type="assignment",
            message="Wrong team notification",
        )
        notification_other_user = Notification(
            user_id=manager_b.id,
            team_id=ids["team_b_id"],
            type="assignment",
            message="B notification",
        )
        db.session.add_all([notification_a, notification_b, notification_other_user])
        db.session.commit()
        notification_b_id = notification_b.id
        login_as(client, manager_a)

    response = client.get("/notifications")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["unread_count"] == 1
    assert [item["message"] for item in payload["notifications"]] == ["A notification"]
    assert client.post(f"/notifications/{notification_b_id}/read").status_code == 404


def test_activity_log_is_scoped_to_current_team(client, app):
    ids = seed_two_teams(app)
    with app.app_context():
        manager_a = db.session.get(User, ids["manager_a_id"])
        manager_b = db.session.get(User, ids["manager_b_id"])
        db.session.add_all([
            ActivityLog(user_id=manager_a.id, team_id=ids["team_a_id"], action="created", details={"title": "A"}),
            ActivityLog(user_id=manager_b.id, team_id=ids["team_b_id"], action="created", details={"title": "B"}),
        ])
        db.session.commit()
        login_as(client, manager_a)

    response = client.get("/activity")
    assert response.status_code == 200
    activity = response.get_json()["activity"]
    assert len(activity) == 1
    assert activity[0]["details"]["title"] == "A"


def test_dashboard_and_weekly_report_are_scoped_to_current_team(client, app):
    ids = seed_two_teams(app)
    today = date.today()
    with app.app_context():
        manager_a = db.session.get(User, ids["manager_a_id"])
        manager_b = db.session.get(User, ids["manager_b_id"])
        task_a = Task(
            user_id=manager_a.id,
            team_id=ids["team_a_id"],
            title="A overdue",
            project="A project",
            due_date=today - timedelta(days=1),
        )
        task_b = Task(
            user_id=manager_b.id,
            team_id=ids["team_b_id"],
            title="B hidden",
            project="B project",
            due_date=today - timedelta(days=1),
        )
        db.session.add_all([task_a, task_b])
        db.session.flush()
        task_a.completed = True
        task_a.status = "done"
        db.session.add_all([
            ActivityLog(user_id=manager_a.id, task_id=task_a.id, team_id=ids["team_a_id"], action="completed"),
            ActivityLog(user_id=manager_b.id, task_id=task_b.id, team_id=ids["team_b_id"], action="completed"),
        ])
        db.session.commit()
        login_as(client, manager_a)

    dashboard = client.get("/stats/dashboard")
    assert dashboard.status_code == 200
    dashboard_payload = dashboard.get_json()
    assert dashboard_payload["total"] == 1
    assert dashboard_payload["by_project"] == {"A project": {"total": 1, "completed": 1}}

    report = client.get("/reports/weekly")
    assert report.status_code == 200
    report_payload = report.get_json()
    assert report_payload["summary"]["created"] == 1
    assert report_payload["summary"]["completed"] == 1
    assert "A project" in report_payload["by_project"]
    assert "B project" not in report_payload["by_project"]
