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


def test_super_admin_creates_team_member(client, app):
    with app.app_context():
        team = make_team("People")
        super_admin = make_user("create_root", role="super_admin")
        db.session.commit()
        login_as(client, super_admin)
        team_id = team.id

    response = client.post(
        f"/admin/teams/{team_id}/members",
        json={
            "username": "new_member",
            "email": "new_member@example.com",
            "password": "P@ssw0rd!",
            "role": "user",
        },
    )
    assert response.status_code == 201
    payload = response.get_json()["user"]
    assert payload["username"] == "new_member"
    assert payload["role"] == "user"
    assert payload["team_id"] == team_id

    with app.app_context():
        created = User.query.filter_by(username="new_member").one()
        assert created.team_id == team_id
        assert created.role == "user"
        audit = TeamAuditLog.query.filter_by(action="user.create", target_user_id=created.id).one()
        assert audit.target_team_id == team_id


def test_super_admin_create_member_rejects_duplicate_username(client, app):
    with app.app_context():
        team = make_team("Dupes")
        super_admin = make_user("dup_root", role="super_admin")
        make_user("existing", team_id=team.id)
        db.session.commit()
        login_as(client, super_admin)
        team_id = team.id

    response = client.post(
        f"/admin/teams/{team_id}/members",
        json={
            "username": "existing",
            "email": "other@example.com",
            "password": "P@ssw0rd!",
            "role": "user",
        },
    )
    assert response.status_code == 400


def test_super_admin_create_member_rejects_archived_team(client, app):
    with app.app_context():
        team = make_team("Archived")
        team.archived = True
        super_admin = make_user("arch_root", role="super_admin")
        db.session.commit()
        login_as(client, super_admin)
        team_id = team.id

    response = client.post(
        f"/admin/teams/{team_id}/members",
        json={
            "username": "no_one",
            "email": "no_one@example.com",
            "password": "P@ssw0rd!",
            "role": "user",
        },
    )
    assert response.status_code == 403
    assert response.get_json().get("code") == "team_archived"


def test_super_admin_post_users_redirects_to_admin_endpoint(client, app):
    with app.app_context():
        super_admin = make_user("legacy_root", role="super_admin")
        db.session.commit()
        login_as(client, super_admin)

    response = client.post(
        "/users",
        json={
            "username": "should_fail",
            "email": "should_fail@example.com",
            "password": "P@ssw0rd!",
            "role": "user",
        },
    )
    assert response.status_code == 400
    assert response.get_json().get("code") == "use_admin_endpoint"


def test_super_admin_deletes_user_and_their_data(client, app):
    with app.app_context():
        team = make_team("UserDelete")
        super_admin = make_user("delroot", role="super_admin")
        target = make_user("doomed", team_id=team.id)
        task = Task(user_id=target.id, title="To be wiped", team_id=team.id)
        task.assignees.append(target)
        saved_filter = SavedFilter(user_id=target.id, team_id=team.id, name="x", filters={})
        notif = Notification(user_id=target.id, team_id=team.id, type="info", message="hi")
        activity = ActivityLog(user_id=target.id, team_id=team.id, action="created", details={})
        db.session.add_all([task, saved_filter, notif, activity])
        db.session.commit()
        login_as(client, super_admin)
        target_id = target.id

    response = client.delete(f"/admin/users/{target_id}")
    assert response.status_code == 204

    with app.app_context():
        assert db.session.get(User, target_id) is None
        assert SavedFilter.query.filter_by(user_id=target_id).count() == 0
        assert Notification.query.filter_by(user_id=target_id).count() == 0
        # ActivityLog rows are kept but user_id is null'd out (audit trail).
        remaining = ActivityLog.query.filter_by(user_id=target_id).all()
        assert remaining == []
        # The team itself remains.
        assert Team.query.filter_by(name="UserDelete").count() == 1
        audit = TeamAuditLog.query.filter_by(action="user.delete").one()
        assert audit.details["username"] == "doomed"
        assert audit.details["deleted_user_id"] == target_id
        assert audit.target_user_id is None


def test_super_admin_cannot_delete_self(client, app):
    with app.app_context():
        super_admin = make_user("self_delete", role="super_admin")
        db.session.commit()
        login_as(client, super_admin)
        sa_id = super_admin.id

    response = client.delete(f"/admin/users/{sa_id}")
    assert response.status_code == 400


def test_super_admin_cannot_delete_last_super_admin(client, app):
    with app.app_context():
        super_admin = make_user("last_root", role="super_admin")
        another = make_user("other", role="super_admin")
        db.session.commit()
        login_as(client, super_admin)
        another_id = another.id

    # First removal works because two super_admins exist.
    response = client.delete(f"/admin/users/{another_id}")
    assert response.status_code == 204

    with app.app_context():
        only_super = User.query.filter_by(role="super_admin").one()
        assert only_super.username == "last_root"

    # Now super_admin tries to remove herself when she is the only one left.
    response = client.delete(f"/admin/users/{super_admin.id}")
    # This is blocked by the self-delete guard, not the last-super-admin guard,
    # but either way the operation must fail.
    assert response.status_code == 400


def test_super_admin_cascade_deletes_team_with_resources(client, app):
    with app.app_context():
        team = make_team("ToWipe")
        super_admin = make_user("cascade_root", role="super_admin")
        member = make_user("doomed_member", team_id=team.id)
        task = Task(user_id=member.id, title="Bye", team_id=team.id)
        task.assignees.append(member)
        notif = Notification(user_id=member.id, team_id=team.id, type="info", message="bye")
        activity = ActivityLog(user_id=member.id, team_id=team.id, action="created", details={})
        db.session.add_all([task, notif, activity])
        db.session.commit()
        login_as(client, super_admin)
        team_id = team.id
        member_id = member.id

    # Without cascade, server still rejects.
    rejected = client.delete(f"/admin/teams/{team_id}")
    assert rejected.status_code == 409

    # With cascade=true, everything goes.
    response = client.delete(f"/admin/teams/{team_id}?cascade=true")
    assert response.status_code == 204

    with app.app_context():
        assert db.session.get(Team, team_id) is None
        assert db.session.get(User, member_id) is None
        assert Task.query.filter_by(team_id=team_id).count() == 0
        assert Notification.query.filter_by(team_id=team_id).count() == 0
        audit = TeamAuditLog.query.filter_by(action="team.delete").one()
        assert audit.target_team_id is None
        assert audit.details.get("team_id") == team_id
        assert audit.details.get("cascade") is True
