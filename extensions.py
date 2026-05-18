from flask_apscheduler import APScheduler
from flask_mail import Mail
from flask_migrate import Migrate
from flask_socketio import SocketIO


mail = Mail()
migrate = Migrate()
scheduler = APScheduler()
socketio = SocketIO(
    async_mode="threading",
    ping_interval=25,
    ping_timeout=60,
)
