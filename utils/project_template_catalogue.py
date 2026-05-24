"""Global, read-only catalogue of project templates.

These are the seed templates copied into every team's editable per-team
template list when a Team is created (R17.3, R17.4). Managers may then
edit/delete their team's copies independently — see utils/template_service.py.

Why not pure Python anymore: kept here so the data is in one place and the
DB-side `ProjectTemplate` rows can be regenerated/re-seeded from this source.
"""

from __future__ import annotations

PROJECT_TEMPLATE_CATALOGUE: dict[str, dict] = {
    "client_onboarding": {
        "name": "Wdrożenie klienta",
        "description": "Standardowy proces startu współpracy z klientem.",
        "color": "#14b8a6",
        "tasks": [
            {"title": "Zebrać wymagania", "priority": "high", "due_offset": 1},
            {"title": "Przygotować plan wdrożenia", "priority": "high", "due_offset": 3, "depends_on": [0]},
            {"title": "Skonfigurować środowisko", "priority": "medium", "due_offset": 5, "depends_on": [1]},
            {"title": "Przeprowadzić szkolenie", "priority": "medium", "due_offset": 7, "depends_on": [2]},
            {"title": "Zamknąć odbiór", "priority": "high", "due_offset": 10, "depends_on": [3]},
        ],
    },
    "release": {
        "name": "Release",
        "description": "Kontrolna lista wydania wersji produkcyjnej.",
        "color": "#6366f1",
        "tasks": [
            {"title": "Zamrozić zakres release'u", "priority": "high", "due_offset": 1},
            {"title": "Przejść testy regresji", "priority": "high", "due_offset": 2, "depends_on": [0]},
            {"title": "Przygotować notatki wydania", "priority": "medium", "due_offset": 2, "depends_on": [0]},
            {"title": "Wdrożyć na produkcję", "priority": "high", "due_offset": 3, "depends_on": [1, 2]},
            {"title": "Monitorować po wdrożeniu", "priority": "medium", "due_offset": 4, "depends_on": [3]},
        ],
    },
    "campaign": {
        "name": "Kampania",
        "description": "Plan przygotowania i uruchomienia kampanii.",
        "color": "#f59e0b",
        "tasks": [
            {"title": "Ustalić cel kampanii", "priority": "high", "due_offset": 1},
            {"title": "Przygotować treści", "priority": "medium", "due_offset": 3, "depends_on": [0]},
            {"title": "Skonfigurować kanały", "priority": "medium", "due_offset": 4, "depends_on": [0]},
            {"title": "Uruchomić kampanię", "priority": "high", "due_offset": 5, "depends_on": [1, 2]},
            {"title": "Podsumować wyniki", "priority": "medium", "due_offset": 12, "depends_on": [3]},
        ],
    },
}


# Backwards-compat alias used by existing /project-templates routes during the
# migration period (Task 5 -> Task 9 refactor). Removed in Task 9 once routes
# read from the per-team DB rows instead.
PROJECT_TEMPLATES = PROJECT_TEMPLATE_CATALOGUE
