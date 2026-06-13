from flask import Blueprint

auth_bp = Blueprint('auth', __name__, url_prefix='/auth')
users_bp = Blueprint('users', __name__, url_prefix='')
tasks_bp = Blueprint('tasks', __name__, url_prefix='')
stats_bp = Blueprint('stats', __name__, url_prefix='')
filters_bp = Blueprint('filters', __name__, url_prefix='')
notifications_bp = Blueprint('notifications', __name__, url_prefix='')
invites_bp = Blueprint('invites', __name__, url_prefix='')
admin_bp = Blueprint('admin', __name__, url_prefix='')
projects_bp = Blueprint('projects', __name__, url_prefix='')

from routes import auth
from routes import users
from routes import tasks
from routes import stats
from routes import filters
from routes import notifications
from routes import invites
from routes import admin
from routes import projects
