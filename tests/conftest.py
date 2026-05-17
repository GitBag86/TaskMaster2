import pytest
from app import create_app
from config import TestingConfig
from models import db, User, Task
import os

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
    """A client with a logged-in admin user."""
    with app.app_context():
        admin = User(username="admin", email="admin@example.com", role="admin")
        admin.set_password("password")
        db.session.add(admin)
        db.session.commit()
        
        with client.session_transaction() as sess:
            sess['user_id'] = admin.id
        
        return client

@pytest.fixture
def user_client(client, app):
    """A client with a logged-in regular user."""
    with app.app_context():
        user = User(username="user", email="user@example.com", role="user")
        user.set_password("password")
        db.session.add(user)
        db.session.commit()
        
        with client.session_transaction() as sess:
            sess['user_id'] = user.id
        
        return client
