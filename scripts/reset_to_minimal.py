#!/usr/bin/env python3
"""
Reset bazy do minimalnego stanu:
- Zachowaj bootstrap super_admina
- Usun wszystkie dane przykladowe
- Utworz 2 zespoly, kazdy z 1 managerem
"""

import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

os.environ.setdefault("ENABLE_SCHEDULER", "false")

from sqlalchemy import text
from app import create_app
from config import Config
from models import db, Team, User
from utils.template_service import seed_team_templates


def main():
    app = create_app(Config)

    with app.app_context():
        print("Czyszczenie danych...")

        # Wyczysc associations + wszystkie tabele team-scoped (porzadek dzieci -> rodzice)
        for tname in [
            'task_assignees', 'project_members', 'task_tags',
            'comment', 'subtask', 'task_dependency', 'custom_field',
            'recurring_task', 'notification', 'activity_log',
            'saved_filter', 'task_template', 'project_template',
            'task', 'project', 'tag',
            'team_invite', 'team_audit_log',
        ]:
            try:
                db.session.execute(text(f"DELETE FROM {tname}"))
            except Exception as e:
                print(f"  skip {tname}: {e}")

        # Usun wszystkich nie-super_admin userow (CHECK constraint pozwoli)
        db.session.execute(text("DELETE FROM \"user\" WHERE role != 'super_admin'"))

        # Usun wszystkie zespoly (super_admin ma team_id NULL, wiec FK nie boli)
        db.session.execute(text("DELETE FROM team"))

        db.session.commit()
        print("OK - dane wyczyszczone, super_admin zostal.")

        # Pokaz co zostalo
        print(f"\nUserzy w bazie ({User.query.count()}):")
        for u in User.query.all():
            print(f"  - {u.username} (role={u.role}, team_id={u.team_id})")

        # Utworz 2 zespoly
        print("\nTworzenie 2 zespolow z managerami...")

        teams_config = [
            ("Marketing", "marketing_manager", "marketing@example.com", "haslo123"),
            ("Operations", "ops_manager", "ops@example.com", "haslo123"),
        ]

        for team_name, username, email, password in teams_config:
            team = Team(
                name=team_name,
                slug=team_name.lower().replace(" ", "-"),
                description=f"Zespol {team_name}",
            )
            db.session.add(team)
            db.session.flush()

            manager = User(
                username=username,
                email=email,
                role="manager",
                team_id=team.id,
            )
            manager.set_password(password)
            db.session.add(manager)
            db.session.flush()

            seed_team_templates(team.id, created_by_id=manager.id)

            print(f"  OK {team_name} (id={team.id}) -> {username} / {password}")

        db.session.commit()

        # Podsumowanie
        print("\n=== Podsumowanie ===")
        print(f"Zespoly: {Team.query.count()}")
        for t in Team.query.all():
            members = User.query.filter_by(team_id=t.id).all()
            print(f"  - {t.name}: {[m.username for m in members]}")
        print(f"\nWszyscy userzy ({User.query.count()}):")
        for u in User.query.order_by(User.id).all():
            print(f"  - {u.username} (role={u.role}, team_id={u.team_id})")


if __name__ == "__main__":
    main()
