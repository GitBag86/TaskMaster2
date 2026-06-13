"""Tests for endpoints not covered by existing test files.

Coverage gaps filled:
  - /tasks/search             (search_tasks)
  - /tasks/export/csv         (export_csv)
  - POST /tags + GET /tags    (manage_tags)
  - POST /filters + GET /filters (manage_filters)
  - POST /templates + GET /templates + POST /templates/:id/use (manage_templates / use_template)
  - POST /tasks/:id/fields    (add_custom_field)
  - /auth/signup-info without token (signup_info)
  - POST /notifications/read-all (mark_all_notifications_read)
  - GET /activity content     (get_activity_log)
"""

import csv
import io

from models import (
    Notification,
    SavedFilter,
    Tag,
    Task,
    TaskTemplate,
    Team,
    User,
    db,
)


# ---------------------------------------------------------------------------
# /tasks/search
# ---------------------------------------------------------------------------

def test_search_tasks_returns_matching_tasks(auth_client):
    auth_client.post("/tasks", json={"title": "Zrobic zakupy", "notes": "mleko, jajka, chleb"})
    auth_client.post("/tasks", json={"title": "Kupic prezent", "notes": "dla mamy"})
    auth_client.post("/tasks", json={"title": "Niepasujace", "notes": "cos innego"})

    response = auth_client.get("/tasks/search?q=zakup")
    assert response.status_code == 200
    titles = [t["title"] for t in response.get_json()["tasks"]]
    assert "Zrobic zakupy" in titles
    assert "Kupic prezent" not in titles


def test_search_tasks_empty_query_returns_empty(auth_client):
    auth_client.post("/tasks", json={"title": "Task"})
    response = auth_client.get("/tasks/search?q=")
    assert response.status_code == 200
    assert response.get_json()["tasks"] == []


def test_search_tasks_matches_also_notes(auth_client):
    auth_client.post("/tasks", json={"title": "Zadanie A", "notes": "wazne haslo XYZ"})
    auth_client.post("/tasks", json={"title": "Zadanie B", "notes": "cos innego"})

    response = auth_client.get("/tasks/search?q=XYZ")
    assert response.status_code == 200
    titles = [t["title"] for t in response.get_json()["tasks"]]
    assert "Zadanie A" in titles
    assert "Zadanie B" not in titles


def test_search_tasks_respects_team_scope(client, app):
    with app.app_context():
        team_a = Team(name="Search A", slug="search-a")
        team_b = Team(name="Search B", slug="search-b")
        db.session.add_all([team_a, team_b])
        db.session.flush()
        manager_a = User(
            username="search_a_admin", email="search_a_admin@example.com",
            role="manager", team_id=team_a.id,
        )
        manager_a.set_password("password")
        manager_b = User(
            username="search_b_admin", email="search_b_admin@example.com",
            role="manager", team_id=team_b.id,
        )
        manager_b.set_password("password")
        db.session.add_all([manager_a, manager_b])
        db.session.commit()

        task_a = Task(user_id=manager_a.id, title="Secret search", team_id=team_a.id)
        task_b = Task(user_id=manager_b.id, title="Secret search", team_id=team_b.id)
        db.session.add_all([task_a, task_b])
        db.session.commit()
        manager_b_id = manager_b.id
        manager_b_team_id = manager_b.team_id

    with client.session_transaction() as sess:
        sess["user_id"] = manager_b_id
        sess["team_id"] = manager_b_team_id
        sess["role"] = "manager"
        sess["session_version"] = 0

    response = client.get("/tasks/search?q=Secret")
    assert response.status_code == 200
    assert len(response.get_json()["tasks"]) == 1


# ---------------------------------------------------------------------------
# /tasks/export/csv
# ---------------------------------------------------------------------------

def test_export_csv_returns_valid_csv_with_headers(auth_client):
    auth_client.post("/tasks", json={"title": "CSV Task", "priority": "high", "project": "CSV Project"})

    response = auth_client.get("/tasks/export/csv")

    assert response.status_code == 200
    assert response.content_type == "text/csv"
    assert "attachment; filename=tasks.csv" in response.headers.get("Content-Disposition", "")

    reader = csv.DictReader(io.StringIO(response.data.decode("utf-8")))
    rows = list(reader)
    assert len(rows) >= 1
    assert rows[0]["Title"] == "CSV Task"
    assert rows[0]["Priority"] == "high"
    assert rows[0]["Project"] == "CSV Project"


def test_export_csv_contains_correct_columns_and_task_data(auth_client):
    auth_client.post("/tasks", json={"title": "CSV Col Test", "priority": "medium", "project": "CSV Col Proj"})

    response = auth_client.get("/tasks/export/csv")
    assert response.status_code == 200

    reader = csv.DictReader(io.StringIO(response.data.decode("utf-8")))
    rows = list(reader)
    assert len(rows) >= 1
    row = rows[0]
    assert "ID" in row
    assert "Title" in row
    assert "Priority" in row
    assert "Project" in row
    assert "Assigned To" in row
    assert "Due Date" in row
    assert "Status" in row
    assert "Notes" in row
    assert row["Title"] == "CSV Col Test"


# ---------------------------------------------------------------------------
# Tags CRUD (POST /tags, GET /tags, DELETE /tags/:id)
# ---------------------------------------------------------------------------

def test_create_and_list_tags(auth_client):
    create = auth_client.post("/tags", json={"name": "urgent", "color": "#ef4444"})
    assert create.status_code == 201
    tag = create.get_json()
    assert tag["name"] == "urgent"
    assert tag["color"] == "#ef4444"

    list_resp = auth_client.get("/tags")
    assert list_resp.status_code == 200
    names = [t["name"] for t in list_resp.get_json()["tags"]]
    assert "urgent" in names


def test_delete_tag(auth_client):
    tag = auth_client.post("/tags", json={"name": "todelete"}).get_json()

    delete_resp = auth_client.delete(f'/tags/{tag["id"]}')
    assert delete_resp.status_code == 200

    list_resp = auth_client.get("/tags")
    names = [t["name"] for t in list_resp.get_json()["tags"]]
    assert "todelete" not in names


def test_delete_other_users_tag_returns_404(user_client, app):
    with app.app_context():
        team_id = Team.query.filter_by(slug="default").one().id
        other = User(username="tag_owner", email="tag_owner@example.com", role="user", team_id=team_id)
        other.set_password("password")
        db.session.add(other)
        db.session.flush()
        tag = Tag(user_id=other.id, team_id=team_id, name="others_tag")
        db.session.add(tag)
        db.session.commit()
        tag_id = tag.id

    response = user_client.delete(f"/tags/{tag_id}")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Saved Filters CRUD (POST /filters, GET /filters)
# ---------------------------------------------------------------------------

def test_create_and_list_filters(auth_client):
    create = auth_client.post("/filters", json={
        "name": "High Priority",
        "filters": {"priority": "high"},
    })
    assert create.status_code == 201
    f = create.get_json()
    assert f["name"] == "High Priority"
    assert f["filters"] == {"priority": "high"}

    list_resp = auth_client.get("/filters")
    assert list_resp.status_code == 200
    names = [item["name"] for item in list_resp.get_json()["filters"]]
    assert "High Priority" in names


def test_filters_scoped_to_current_user(auth_client, app):
    with app.app_context():
        team_id = Team.query.filter_by(slug="default").one().id
        other = User(username="filter_owner", email="filter_owner@example.com", role="user", team_id=team_id)
        other.set_password("password")
        db.session.add(other)
        db.session.flush()
        sf = SavedFilter(user_id=other.id, team_id=team_id, name="Others Filter", filters={})
        db.session.add(sf)
        db.session.commit()

    list_resp = auth_client.get("/filters")
    names = [item["name"] for item in list_resp.get_json()["filters"]]
    assert "Others Filter" not in names


def test_delete_filter(auth_client):
    sf = auth_client.post("/filters", json={"name": "To Delete", "filters": {}}).get_json()
    response = auth_client.delete(f'/filters/{sf["id"]}')
    assert response.status_code == 200

    list_resp = auth_client.get("/filters")
    names = [item["name"] for item in list_resp.get_json()["filters"]]
    assert "To Delete" not in names


# ---------------------------------------------------------------------------
# Templates CRUD (POST /templates, GET /templates, POST /templates/:id/use)
# ---------------------------------------------------------------------------

def test_create_and_list_templates(auth_client):
    create = auth_client.post("/templates", json={
        "name": "Bug Report",
        "description": "Template for bug tasks",
        "template_data": {"title": "Bug: ", "priority": "high"},
    })
    assert create.status_code == 201
    tmpl = create.get_json()
    assert tmpl["name"] == "Bug Report"
    assert tmpl["template_data"]["priority"] == "high"

    list_resp = auth_client.get("/templates")
    names = [t["name"] for t in list_resp.get_json()["templates"]]
    assert "Bug Report" in names


def test_use_template_creates_task(auth_client):
    tmpl = auth_client.post("/templates", json={
        "name": "Quick Bug",
        "template_data": {"title": "Bug: Login crash"},
    }).get_json()

    use_resp = auth_client.post(f'/templates/{tmpl["id"]}/use')
    assert use_resp.status_code == 201
    task = use_resp.get_json()
    assert task["title"] == "Bug: Login crash"

    list_resp = auth_client.get("/templates")
    assert list_resp.status_code == 200


def test_delete_template(auth_client):
    tmpl = auth_client.post("/templates", json={
        "name": "To Delete Template",
        "template_data": {"title": "Delete me"},
    }).get_json()

    response = auth_client.delete(f'/templates/{tmpl["id"]}')
    assert response.status_code == 200

    list_resp = auth_client.get("/templates")
    names = [t["name"] for t in list_resp.get_json()["templates"]]
    assert "To Delete Template" not in names


# ---------------------------------------------------------------------------
# Custom Fields (POST /tasks/:id/fields)
# ---------------------------------------------------------------------------

def test_add_custom_field_to_task(auth_client):
    task = auth_client.post("/tasks", json={"title": "Task with field"}).get_json()

    response = auth_client.post(f'/tasks/{task["id"]}/fields', json={
        "field_name": "estimated_hours",
        "field_value": "8",
    })
    assert response.status_code == 201
    field = response.get_json()
    assert field["field_name"] == "estimated_hours"
    assert field["field_value"] == "8"


def test_custom_field_rejects_nonexistent_task(auth_client):
    response = auth_client.post("/tasks/99999/fields", json={
        "field_name": "test",
        "field_value": "value",
    })
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# /auth/signup-info (without token)
# ---------------------------------------------------------------------------

def test_signup_info_without_token(client):
    """signup-info should work without a token, returning the configured mode."""
    response = client.get("/auth/signup-info")
    assert response.status_code == 200
    data = response.get_json()
    assert "mode" in data


# ---------------------------------------------------------------------------
# POST /notifications/read-all
# ---------------------------------------------------------------------------

def test_mark_all_notifications_read(client, app):
    with app.app_context():
        team = Team(name="ReadAll Scope", slug="readall-scope")
        db.session.add(team)
        db.session.flush()
        manager = User(
            username="readall_manager", email="readall_manager@example.com",
            role="manager", team_id=team.id,
        )
        manager.set_password("password")
        db.session.add(manager)
        db.session.commit()

        notification = Notification(
            user_id=manager.id, team_id=team.id,
            type="info", message="Test notif", read=False,
        )
        db.session.add(notification)
        db.session.commit()
        manager_id = manager.id
        manager_team_id = manager.team_id

    with client.session_transaction() as sess:
        sess["user_id"] = manager_id
        sess["team_id"] = manager_team_id
        sess["role"] = "manager"
        sess["session_version"] = 0

    list_before = client.get("/notifications")
    assert list_before.get_json()["unread_count"] >= 1

    response = client.post("/notifications/read-all")
    assert response.status_code == 200
    assert response.get_json()["unread_count"] == 0

    list_after = client.get("/notifications")
    assert list_after.get_json()["unread_count"] == 0


# ---------------------------------------------------------------------------
# GET /activity — content format
# ---------------------------------------------------------------------------

def test_activity_endpoint_returns_formatted_logs(auth_client, app):
    task = auth_client.post("/tasks", json={"title": "Activity test task"}).get_json()
    auth_client.put(f'/tasks/{task["id"]}', json={"title": "Activity test updated"})

    response = auth_client.get("/activity?limit=10")
    assert response.status_code == 200
    data = response.get_json()
    assert len(data["activity"]) >= 2

    # Check that activity items include proper fields
    for item in data["activity"]:
        assert "id" in item
        assert "action" in item
        assert "created_at" in item
        if item["task_id"] is not None:
            assert item["task_id"] == task["id"]

    # Verify created and updated actions are present
    actions = [item["action"] for item in data["activity"]]
    assert "created" in actions
    assert "updated" in actions


def test_activity_limit_parameter(auth_client):
    for i in range(5):
        auth_client.post("/tasks", json={"title": f"Activity limit {i}"})

    response = auth_client.get("/activity?limit=3")
    assert response.status_code == 200
    assert len(response.get_json()["activity"]) == 3


def test_activity_caps_at_200(auth_client):
    response = auth_client.get("/activity?limit=999")
    assert response.status_code == 200
    assert len(response.get_json()["activity"]) <= 200
