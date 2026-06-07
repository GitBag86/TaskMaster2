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
    default_limits=[],
    storage_uri="memory://",
)
mail = Mail()
migrate = Migrate()
scheduler = APScheduler()
socketio = SocketIO(
    async_mode="threading",
    ping_interval=25,
    ping_timeout=60,
)
