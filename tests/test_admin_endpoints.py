from models import ActivityLog, Notification, SavedFilter, Task, Team, TeamAuditLog, User, db


def make_team(name):
    team = Team(name=name, slug=name.lower().replace(" ", "-"))
    db.session.add(team)
    db.session.flush()
    return team


def make_user(username, role="user", team_id=None):
    user = User(username=username, email=f"{username}@example.com", role=role, team_id=team_id)
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


def test_super_admin_can_crud_empty_team_and_audit_actions(client, app):
    with app.app_context():
        super_admin = make_user("root", role="super_admin")
        db.session.commit()
        login_as(client, super_admin)

    created = client.post("/admin/teams", json={"name": "Support", "description": "Help desk"})
    assert created.status_code == 201
    team = created.get_json()["team"]
    assert team["name"] == "Support"
    assert team["slug"] == "support"

    renamed = client.put(f"/admin/teams/{team['id']}", json={"name": "Customer Support"})
    assert renamed.status_code == 200
    assert renamed.get_json()["team"]["slug"] == "customer-support"

    archived = client.post(f"/admin/teams/{team['id']}/archive", json={"archived": True})
    assert archived.status_code == 200
    assert archived.get_json()["team"]["archived"] is True

    audit = client.get("/admin/audit")
    assert audit.status_code == 200
    actions = [entry["action"] for entry in audit.get_json()["audit"]]
    assert "team.create" in actions
    assert "team.update" in actions
    assert "team.archive" in actions

    deleted = client.delete(f"/admin/teams/{team['id']}")
    assert deleted.status_code == 204


def test_manager_cannot_use_super_admin_team_endpoints(client, app):
    with app.app_context():
        team = make_team("Ops")
        manager = make_user("ops_manager", role="manager", team_id=team.id)
        db.session.commit()
        login_as(client, manager)

    response = client.get("/admin/teams")
    assert response.status_code == 403


def test_super_admin_team_validations(client, app):
    with app.app_context():
        super_admin = make_user("validator", role="super_admin")
        team = make_team("Finance")
        make_user("finance_user", team_id=team.id)
        empty_team = make_team("Empty")
        db.session.commit()
        login_as(client, super_admin)
        team_id = team.id
        empty_team_id = empty_team.id

    duplicate = client.put(f"/admin/teams/{empty_team_id}", json={"name": "Finance"})
    assert duplicate.status_code == 400

    non_empty_delete = client.delete(f"/admin/teams/{team_id}")
    assert non_empty_delete.status_code == 409
    assert non_empty_delete.get_json()["code"] == "team_not_empty"


def test_super_admin_moves_user_between_teams_and_invalidates_session(client, app):
    with app.app_context():
        source = make_team("Source")
        target = make_team("Target")
        super_admin = make_user("move_root", role="super_admin")
        user = make_user("moved_user", team_id=source.id)
        task = Task(user_id=user.id, title="Old task", team_id=source.id)
        task.assignees.append(user)
        saved_filter = SavedFilter(user_id=user.id, team_id=source.id, name="Mine", filters={})
        notification = Notification(user_id=user.id, team_id=source.id, type="info", message="Hi")
        activity = ActivityLog(user_id=user.id, team_id=source.id, action="created", details={})
        db.session.add_all([task, saved_filter, notification, activity])
        db.session.commit()
        login_as(client, super_admin)
        user_id = user.id
        task_id = task.id
        target_id = target.id

    response = client.post(f"/admin/users/{user_id}/team", json={"team_id": target_id})
    assert response.status_code == 200
    data = response.get_json()["user"]
    assert data["team_id"] == target_id

    with app.app_context():
        moved = db.session.get(User, user_id)
        assert moved.session_version == 1
        assert SavedFilter.query.filter_by(user_id=user_id, team_id=target_id).count() == 1
        assert Notification.query.filter_by(user_id=user_id, team_id=target_id).count() == 1
        assert ActivityLog.query.filter_by(user_id=user_id, team_id=target_id).count() >= 1
        assert db.session.get(Task, task_id).assignees == []
        audit = TeamAuditLog.query.filter_by(action="user.move", target_user_id=user_id).one()
        assert audit.target_team_id == target_id


def test_super_admin_changes_user_role_with_validation(client, app):
    with app.app_context():
        team = make_team("Roles")
        super_admin = make_user("role_root", role="super_admin")
        user = make_user("role_user", team_id=team.id)
        db.session.commit()
        login_as(client, super_admin)
        user_id = user.id

    promoted = client.post(f"/admin/users/{user_id}/role", json={"role": "manager"})
    assert promoted.status_code == 200
    assert promoted.get_json()["user"]["role"] == "manager"

    invalid = client.post(f"/admin/users/{user_id}/role", json={"role": "owner"})
    assert invalid.status_code == 400
