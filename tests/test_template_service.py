"""Tests for utils/template_service.seed_team_templates (Task 5).

Covers:
- Seeding a fresh team produces 3 ProjectTemplate rows (one per catalogue entry).
- Each row has the right `source_catalogue_key`, `name`, `description`, `color`.
- `payload['tasks']` matches the catalogue tasks list.
- Idempotency: running seed_team_templates twice does not duplicate rows.
- Each team gets independent copies (manager edit on team A doesn't bleed to B).
- Existing routes /project-templates GET return per-team template rows.
"""

from __future__ import annotations

from models import ProjectTemplate, Team, db
from utils.project_template_catalogue import PROJECT_TEMPLATE_CATALOGUE
from utils.template_service import seed_team_templates


def _make_team(name: str = "Seed") -> Team:
    team = Team(name=name, slug=name.lower())
    db.session.add(team)
    db.session.flush()
    return team


def test_seed_team_templates_creates_one_row_per_catalogue_entry(app):
    with app.app_context():
        team = _make_team("S1")
        created = seed_team_templates(team.id)
        db.session.commit()

        assert len(created) == len(PROJECT_TEMPLATE_CATALOGUE)
        rows = ProjectTemplate.query.filter_by(team_id=team.id).all()
        assert len(rows) == len(PROJECT_TEMPLATE_CATALOGUE)


def test_seed_team_templates_preserves_catalogue_data(app):
    with app.app_context():
        team = _make_team("S2")
        seed_team_templates(team.id)
        db.session.commit()

        row = ProjectTemplate.query.filter_by(
            team_id=team.id, source_catalogue_key="client_onboarding"
        ).first()
        assert row is not None
        assert row.name == "Wdrożenie klienta"
        assert row.color == "#14b8a6"
        # payload preserves the tasks list verbatim
        assert row.payload["tasks"][0]["title"] == "Zebrać wymagania"
        assert len(row.payload["tasks"]) == 5


def test_seed_team_templates_is_idempotent(app):
    """Running twice must not duplicate rows (R4.7-style idempotency)."""
    with app.app_context():
        team = _make_team("S3")

        first = seed_team_templates(team.id)
        db.session.commit()
        second = seed_team_templates(team.id)
        db.session.commit()

        assert len(first) == len(PROJECT_TEMPLATE_CATALOGUE)
        assert len(second) == 0  # nothing new on second run
        rows = ProjectTemplate.query.filter_by(team_id=team.id).all()
        assert len(rows) == len(PROJECT_TEMPLATE_CATALOGUE)


def test_seed_team_templates_isolates_teams(app):
    """Editing team A's copy does NOT affect team B's copy."""
    with app.app_context():
        team_a = _make_team("Sa")
        team_b = _make_team("Sb")
        seed_team_templates(team_a.id)
        seed_team_templates(team_b.id)
        db.session.commit()

        # Manager A renames their copy
        a_release = ProjectTemplate.query.filter_by(
            team_id=team_a.id, source_catalogue_key="release"
        ).first()
        a_release.name = "A's customized release"
        db.session.commit()

        # Team B's copy is untouched
        b_release = ProjectTemplate.query.filter_by(
            team_id=team_b.id, source_catalogue_key="release"
        ).first()
        assert b_release.name == "Release"
        assert b_release.name != a_release.name


def test_project_template_to_dict(app):
    with app.app_context():
        team = _make_team("Sd")
        seed_team_templates(team.id)
        db.session.commit()

        row = ProjectTemplate.query.filter_by(team_id=team.id).first()
        data = row.to_dict()
        assert data["team_id"] == team.id
        assert "source_catalogue_key" in data
        assert "payload" in data
        assert "tasks" in data["payload"]


def test_project_templates_endpoint_returns_current_team_rows(auth_client, app):
    """Task 9: GET /project-templates reads the current team's DB copies."""
    response = auth_client.get("/project-templates")
    assert response.status_code == 200
    data = response.get_json()
    assert "templates" in data
    template_ids = {t["id"] for t in data["templates"]}
    assert len(template_ids) == len(PROJECT_TEMPLATE_CATALOGUE)
    with app.app_context():
        assert template_ids == {row.id for row in ProjectTemplate.query.all()}


def test_cascade_delete_team_removes_its_templates(app):
    """ProjectTemplate has cascade='all, delete-orphan' on team relationship."""
    with app.app_context():
        team = _make_team("Sx")
        seed_team_templates(team.id)
        db.session.commit()
        team_id = team.id
        assert ProjectTemplate.query.filter_by(team_id=team_id).count() > 0

        db.session.delete(team)
        db.session.commit()

        assert ProjectTemplate.query.filter_by(team_id=team_id).count() == 0
