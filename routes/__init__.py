from flask import Blueprint

auth_bp = Blueprint('auth', __name__, url_prefix='/auth')
users_bp = Blueprint('users', __name__, url_prefix='')
tasks_bp = Blueprint('tasks', __name__, url_prefix='')
stats_bp = Blueprint('stats', __name__, url_prefix='')
filters_bp = Blueprint('filters', __name__, url_prefix='')
notifications_bp = Blueprint('notifications', __name__, url_prefix='')

from routes.auth import *
from routes.users import *
from routes.tasks import *
from routes.stats import *
from routes.filters import *
from routes.notifications import *
