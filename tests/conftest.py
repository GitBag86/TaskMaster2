from pathlib import Path
import sys
import os

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Keep tests isolated from the process-global APScheduler instance created in app.py.
os.environ.setdefault("ENABLE_SCHEDULER", "false")

from app import create_app
from config import TestingConfig
from models import db, Team, User, Task
from utils.template_service import seed_team_templates

@pytest.fixture
def app():
    flask_app = create_app(TestingConfig)
    flask_app.config.update({"WTF_CSRF_ENABLED": False})

    with flask_app.app_context():
        db.create_all()
        yield flask_app
        db.session.remove()
        db.drop_all()

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def runner(app):
    return app.test_cli_runner()

@pytest.fixture
def auth_client(client, app):
    """A client with a logged-in team manager."""
    with app.app_context():
        team = Team(name="Default", slug="default")
        db.session.add(team)
        db.session.flush()
        admin = User(username="admin", email="admin@example.com", role="manager", team_id=team.id)
        admin.set_password("password")
        db.session.add(admin)
        db.session.flush()
        seed_team_templates(team.id, created_by_id=admin.id)
        db.session.commit()
        
        with client.session_transaction() as sess:
            sess['user_id'] = admin.id
            sess['team_id'] = team.id
            sess['role'] = admin.role
            sess['session_version'] = admin.session_version
        
        return client

@pytest.fixture
def user_client(client, app):
    """A client with a logged-in regular user."""
    with app.app_context():
        team = Team(name="Default", slug="default")
        db.session.add(team)
        db.session.flush()
        user = User(username="user", email="user@example.com", role="user", team_id=team.id)
        user.set_password("password")
        db.session.add(user)
        db.session.commit()
        
        with client.session_transaction() as sess:
            sess['user_id'] = user.id
            sess['team_id'] = team.id
            sess['role'] = user.role
            sess['session_version'] = user.session_version
        
        return client
