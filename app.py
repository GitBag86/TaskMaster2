from flask import Flask, send_file, session, jsonify, request
from flask_cors import CORS
from flask_migrate import Migrate
from flask_socketio import SocketIO
from dotenv import load_dotenv
import os
import logging

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
os.makedirs(app.instance_path, exist_ok=True)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(app.instance_path, 'tasks.db')

secret_key = os.environ.get('SECRET_KEY')
if not secret_key:
    raise RuntimeError(
        "SECRET_KEY environment variable is not set. "
        "Generate one with: python -c 'import secrets; print(secrets.token_hex(32))'"
    )
app.config['SECRET_KEY'] = secret_key

allowed_origins = os.environ.get('CORS_ORIGINS', 'http://localhost:5000').split(',')
CORS(app, supports_credentials=True, origins=allowed_origins)

socketio = SocketIO(app, cors_allowed_origins=allowed_origins, async_mode='threading')

from models import db
from flask_migrate import Migrate

db.init_app(app)
migrate = Migrate(app, db)

with app.app_context():
    db.create_all()

# Register blueprints
from routes import auth_bp, users_bp, tasks_bp, stats_bp, filters_bp
app.register_blueprint(auth_bp)
app.register_blueprint(users_bp)
app.register_blueprint(tasks_bp)
app.register_blueprint(stats_bp)
app.register_blueprint(filters_bp)

# Static file routes
@app.route('/')
def index():
    return send_file('index.html')

@app.route('/manifest.json')
def manifest():
    return send_file('manifest.json')

@app.route('/sw.js')
def sw():
    return send_file('sw.js')

@app.route('/health')
def health():
    return jsonify({'status': 'healthy'}), 200

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
