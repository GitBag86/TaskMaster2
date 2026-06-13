import os

from flask_apscheduler import APScheduler
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_mail import Mail
from flask_migrate import Migrate
from flask_socketio import SocketIO
from flask_wtf.csrf import CSRFProtect


csrf = CSRFProtect()
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["120 per minute"],
    storage_uri="memory://",
)
mail = Mail()
migrate = Migrate()
scheduler = APScheduler()
# Map gunicorn worker class "gthread" → socketio async_mode "threading"
# (gthread is a valid --worker-class for gunicorn but NOT a socketio async mode).
_async_mode = os.environ.get("SOCKETIO_ASYNC_MODE", "threading")
if _async_mode == "gthread":
    _async_mode = "threading"
socketio = SocketIO(
    async_mode=_async_mode,
    ping_interval=25,
    ping_timeout=60,
)
