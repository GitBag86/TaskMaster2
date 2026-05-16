import json
import os
import sys
import time
import logging
from dotenv import load_dotenv
from flask import Flask, send_from_directory, session, jsonify, request
from flask_cors import CORS
from flask_migrate import Migrate
from flask_socketio import SocketIO
from flask_mail import Mail
from flask_apscheduler import APScheduler

# #region agent log
_DEBUG_LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "debug-59c6ac.log")


def _agent_ndjson_log(hypothesis_id, message, **data):
    line = json.dumps({"sessionId": "59c6ac", "runId": os.environ.get("APP_DEBUG_RUN", "startup"), "hypothesisId": hypothesis_id, "location": "app.py:bootstrap", "message": message, "data": data, "timestamp": int(time.time() * 1000)}) + "\n"
    try:
        with open(_DEBUG_LOG_PATH, "a", encoding="utf-8") as _f:
            _f.write(line)
    except OSError:
        try:
            sys.stderr.write(line)
            sys.stderr.flush()
        except OSError:
            pass


_agent_ndjson_log("H1", "interpreter_startup", exe=sys.executable)
_agent_ndjson_log("H4", "python_env_paths", exe=sys.executable, prefix=sys.prefix, base_prefix=getattr(sys, "base_prefix", sys.prefix), virtual_env=os.environ.get("VIRTUAL_ENV"))
# #endregion

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='frontend/dist', static_url_path='/')
os.makedirs(app.instance_path, exist_ok=True)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(app.instance_path, 'tasks.db')

secret_key = os.environ.get('SECRET_KEY')
_agent_ndjson_log("H3", "secret_key_check", present=bool(secret_key))

if not secret_key:
    raise RuntimeError(
        "SECRET_KEY environment variable is not set. "
        "Generate one with: python -c 'import secrets; print(secrets.token_hex(32))'"
    )
app.config['SECRET_KEY'] = secret_key

# Configure Flask-Mail
app.config['MAIL_SERVER'] = os.environ.get('MAIL_SERVER')
app.config['MAIL_PORT'] = int(os.environ.get('MAIL_PORT', 587))
app.config['MAIL_USE_TLS'] = os.environ.get('MAIL_USE_TLS', 'True').lower() == 'true'
app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD')
app.config['MAIL_DEFAULT_SENDER'] = os.environ.get('MAIL_DEFAULT_SENDER')

mail = Mail(app)
scheduler = APScheduler()
scheduler.init_app(app)

allowed_origins = os.environ.get('CORS_ORIGINS', 'http://localhost:5000').split(',')
CORS(app, supports_credentials=True, origins=allowed_origins)

socketio = SocketIO(app, cors_allowed_origins=allowed_origins, async_mode='threading')

from models import db
from jobs.deadline_notifier import check_deadlines

db.init_app(app)
migrate = Migrate(app, db)

with app.app_context():
    db.create_all()

scheduler.add_job(id='check_deadlines', func=check_deadlines, trigger='interval', days=1)
scheduler.start()
_agent_ndjson_log("H6", "scheduler_started")

# Register blueprints
# #region agent log
try:
    from routes import auth_bp, users_bp, tasks_bp, stats_bp, filters_bp
    _agent_ndjson_log("H5", "routes_blueprints_import_ok")
except Exception as e:
    _agent_ndjson_log("H5", "routes_blueprints_import_fail", error=type(e).__name__, detail=str(e))
    raise
# #endregion
app.register_blueprint(auth_bp)
app.register_blueprint(users_bp)
app.register_blueprint(tasks_bp)
app.register_blueprint(stats_bp)
app.register_blueprint(filters_bp)

# Serve React build
@app.route('/')
def index():
    try:
        return send_from_directory(app.static_folder, 'index.html')
    except Exception:
        return jsonify({"error": "Frontend not built. Run: cd frontend && npm run build"}), 503

@app.route('/manifest.json')
def manifest():
    return send_from_directory(app.static_folder, 'manifest.json')

@app.route('/sw.js')
def sw():
    return send_from_directory(app.static_folder, 'sw.js')

@app.route('/health')
def health():
    return jsonify({'status': 'healthy'}), 200

# Catch-all for SPA routing
@app.route('/<path:path>')
def serve_spa(path):
    if path.startswith(('auth', 'tasks', 'users', 'stats', 'activity', 'tags', 'filters', 'templates', 'dependencies', 'subtasks', 'socket.io')):
        return jsonify({"error": "Not found"}), 404
    try:
        return send_from_directory(app.static_folder, path)
    except Exception:
        return send_from_directory(app.static_folder, 'index.html')

# Error handlers
@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Nie znaleziono"}), 404

@app.errorhandler(500)
def server_error(e):
    logger.error(f"Server error: {e}")
    return jsonify({"error": "Wewnętrzny błąd serwera"}), 500

@app.before_request
def log_request():
    logger.info(f"Request: {request.method} {request.path}")

logger.info("App initialized with blueprints")

if __name__ == '__main__':
    socketio.run(
        app,
        debug=True,
        host='0.0.0.0',
        port=5000,
        allow_unsafe_werkzeug=True,
        use_reloader=False
    )
