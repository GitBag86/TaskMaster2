#!/usr/bin/env python3
"""
Production seed script — run once after a fresh deploy to populate the database
with initial teams, manager accounts, sample projects and tasks.

Idempotent: skips teams that already exist (matched by name).
Safe to run multiple times.

Usage:
  python scripts/seed_production.py

Environment variables (overridable):
  SEED_TEAM_PREFIX       — prefix for team names (default: "")
  SEED_MANAGER_PASSWORD  — shared password for all seeded managers (default: "Manager123!")
"""

import os
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

os.environ.setdefault("ENABLE_SCHEDULER", "false")
os.environ.setdefault("FLASK_ENV", "development")

from app import create_app
from config import Config
from models import db, Team, User, Project, Task, Tag

# ──────────────────────────────────────────────
# Configuration — tweak before first run
# ──────────────────────────────────────────────

MANAGER_PASSWORD = os.environ.get("SEED_MANAGER_PASSWORD", "Manager123!")

TEAMS = [
    {
        "name": "Marketing",
        "slug": "marketing",
        "description": "Dział marketingu — kampanie, social media, content",
        "manager_username": "marketing_manager",
        "manager_email": "marketing@example.com",
        "projects": [
            {"name": "Kampania Q2",   "description": "Kampania reklamowa na drugi kwartał",       "color": "#ef4444"},
            {"name": "Social Media",  "description": "Content na LinkedIn, Twitter, Facebook",     "color": "#3b82f6"},
        ],
        "tags": ["social", "kampania", "content"],
        "tasks": [
            {"title": "Przygotować brief dla agencji",       "project": "Kampania Q2",  "priority": "high",   "days_ahead": 7},
            {"title": "Zaplanować kalendarz contentowy",      "project": "Social Media",  "priority": "medium", "days_ahead": 14},
            {"title": "Przygotować raport z poprzedniej kampanii", "project": "Kampania Q2", "priority": "medium", "days_ahead": 3},
            {"title": "Aktualizacja profili na LinkedIn",     "project": "Social Media",  "priority": "low",    "days_ahead": 21},
        ],
    },
    {
        "name": "Operations",
        "slug": "operations",
        "description": "Dział operacyjny — logistyka, procesy, dostawy",
        "manager_username": "ops_manager",
        "manager_email": "ops@example.com",
        "projects": [
            {"name": "Optymalizacja procesów", "description": "Audyt i usprawnienie procesów wewnętrznych", "color": "#22c55e"},
            {"name": "Dostawy Q2",             "description": "Koordynacja dostaw na drugi kwartał",        "color": "#f59e0b"},
        ],
        "tags": ["logistyka", "procesy", "dostawy"],
        "tasks": [
            {"title": "Mapowanie procesu zamówień",        "project": "Optymalizacja procesów", "priority": "high",   "days_ahead": 10},
            {"title": "Negocjacje z nowym dostawcą",       "project": "Dostawy Q2",             "priority": "high",   "days_ahead": 5},
            {"title": "Aktualizacja SOP dla magazynu",     "project": "Optymalizacja procesów", "priority": "medium", "days_ahead": 14},
            {"title": "Przegląd umów z kurierami",         "project": "Dostawy Q2",             "priority": "low",    "days_ahead": 30},
        ],
    },
    {
        "name": "Development",
        "slug": "development",
        "description": "Zespół programistyczny — produkty, bugi, feature'y",
        "manager_username": "dev_manager",
        "manager_email": "dev@example.com",
        "projects": [
            {"name": "Web App",   "description": "Aplikacja webowa dla klientów",          "color": "#8b5cf6"},
            {"name": "API v2",    "description": "Nowa wersja API z dokumentacją",          "color": "#06b6d4"},
            {"name": "DevOps",    "description": "Infrastruktura i CI/CD",                  "color": "#6366f1"},
        ],
        "tags": ["frontend", "backend", "devops", "api"],
        "tasks": [
            {"title": "Implementacja nowego dashboardu",       "project": "Web App",  "priority": "high",   "days_ahead": 14},
            {"title": "Migracja bazy danych do PostgreSQL",    "project": "DevOps",   "priority": "high",   "days_ahead": 7},
            {"title": "Dokumentacja endpointów REST",          "project": "API v2",   "priority": "medium", "days_ahead": 21},
            {"title": "Konfiguracja staging environment",      "project": "DevOps",   "priority": "medium", "days_ahead": 10},
            {"title": "Refaktoryzacja modułu autoryzacji",     "project": "Web App",  "priority": "low",    "days_ahead": 28},
            {"title": "Testy wydajnościowe API",               "project": "API v2",   "priority": "low",    "days_ahead": 35},
        ],
    },
]


def _seed_team(config: dict) -> Team | None:
    """Create a team with manager, projects, tags, and sample tasks. Idempotent."""
    # Skip if team already exists
    existing = Team.query.filter_by(slug=config["slug"]).first()
    if existing is not None:
        print(f"  ⏭️  Team '{config['name']}' already exists — skipping")
        return existing

    # 1. Create team
    team = Team(
        name=config["name"],
        slug=config["slug"],
        description=config["description"],
    )
    db.session.add(team)
    db.session.flush()
    print(f"  ✅ Team '{config['name']}' created (id={team.id})")

    # 2. Create manager
    manager = User(
        username=config["manager_username"],
        email=config["manager_email"],
        role="manager",
        team_id=team.id,
    )
    manager.set_password(MANAGER_PASSWORD)
    db.session.add(manager)
    db.session.flush()
    print(f"     Manager: {manager.username} / {MANAGER_PASSWORD}")

    # 3. Create projects
    project_map = {}
    for proj in config["projects"]:
        project = Project(
            name=proj["name"],
            description=proj["description"],
            color=proj["color"],
            created_by_id=manager.id,
            team_id=team.id,
        )
        db.session.add(project)
        db.session.flush()
        project_map[proj["name"]] = project

    # 4. Create tags
    for tag_name in config["tags"]:
        tag = Tag(
            user_id=manager.id,
            team_id=team.id,
            name=tag_name,
            color=f"#{(abs(hash(tag_name)) % 0xFFFFFF):06x}",
        )
        db.session.add(tag)

    # 5. Create tasks
    today = datetime.now(timezone.utc).date()
    for task_def in config["tasks"]:
        project = project_map.get(task_def["project"])
        due = today + timedelta(days=task_def["days_ahead"])
        task = Task(
            user_id=manager.id,
            project_id=project.id if project else None,
            team_id=team.id,
            title=task_def["title"],
            priority=task_def["priority"],
            status="todo",
            project=task_def["project"],
            due_date=due,
        )
        db.session.add(task)

    db.session.commit()
    return team


def _ensure_migrations(app):
    """Run any pending Alembic migrations before seeding."""
    from flask_migrate import upgrade
    upgrade()
    print("  ✅ Database schema up to date\n")


def main():
    print("=" * 56)
    print("  TaskMaster2 — Production Seed")
    print("=" * 56)
    print()

    app = create_app(Config)

    with app.app_context():
        _ensure_migrations(app)
        print("Seeding teams...\n")

        for team_config in TEAMS:
            _seed_team(team_config)

        # Summary
        print("\n" + "=" * 56)
        print("  Seed Summary")
        print("=" * 56)
        print(f"  Teams:    {Team.query.count()}")
        print(f"  Users:    {User.query.count()}")
        print(f"  Projects: {Project.query.count()}")
        print(f"  Tags:     {Tag.query.count()}")
        print(f"  Tasks:    {Task.query.count()}")
        print()

        print("  Accounts created / confirmed:")
        team_count = Team.query.count()
        for team in Team.query.order_by(Team.id).all():
            managers = User.query.filter_by(team_id=team.id, role="manager").all()
            for m in managers:
                print(f"    {m.username:25s} / {MANAGER_PASSWORD:20s}  →  {team.name}")
        super_admins = User.query.filter_by(role="super_admin").all()
        for sa in super_admins:
            print(f"    {sa.username:25s}  (super_admin — logged in via env config)")

        print()
        print("  Done!")


if __name__ == "__main__":
    main()
