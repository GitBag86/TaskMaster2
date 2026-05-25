"""Template_Service — manages per-team copies of project templates.

Called from:
- The data backfill in Task 6's migration (seeds Default team).
- Future `routes/admin.py::create_team` handler (Task 20) so every newly
  created team starts with the standard catalogue.

See requirements R17 and design section 7.
"""

from __future__ import annotations

from typing import Optional

from models import ProjectTemplate, db
from utils.project_template_catalogue import PROJECT_TEMPLATE_CATALOGUE


def seed_team_templates(team_id: int, *, created_by_id: Optional[int] = None) -> list[ProjectTemplate]:
    """Insert per-team copies of every catalogue entry not already present.

    Idempotent: existing rows for the same `(team_id, source_catalogue_key)`
    are left untouched, so running this twice is a no-op.

    Returns the list of newly created `ProjectTemplate` rows (empty list when
    everything was already present).

    Note: caller is responsible for `db.session.commit()`. We keep this as
    explicit-commit so callers can roll back on failure (e.g. in migration).
    """
    created: list[ProjectTemplate] = []
    for key, payload in PROJECT_TEMPLATE_CATALOGUE.items():
        existing = (
            ProjectTemplate.query
            .filter_by(team_id=team_id, source_catalogue_key=key)
            .first()
        )
        if existing is not None:
            continue

        template = ProjectTemplate(
            team_id=team_id,
            source_catalogue_key=key,
            name=payload['name'],
            description=payload.get('description', ''),
            color=payload.get('color', '#3b82f6'),
            payload={'tasks': payload['tasks']},
            created_by_id=created_by_id,
        )
        db.session.add(template)
        created.append(template)

    if created:
        db.session.flush()
    return created
