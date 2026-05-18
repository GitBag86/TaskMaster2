import logging
import os

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from config import Config
from extensions import mail, migrate, scheduler, socketio
from jobs.deadline_notifier import check_deadlines
from models import db

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _configure_app(app):
    secret_key = app.config.get("SECRET_KEY")
    if not secret_key:
        raise RuntimeError(
            "SECRET_KEY environment variable is not set. "
            "Generate one with: python -c 'import secrets; print(secrets.token_hex(32))'"
        )

    os.makedirs(app.instance_path, exist_ok=True)
    if not app.config.get("SQLALCHEMY_DATABASE_URI"):
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(app.instance_path, "tasks.db")

    CORS(app, supports_credentials=True, origins=app.config["CORS_ORIGINS"])


def _register_blueprints(app):
    from routes import auth_bp, filters_bp, stats_bp, tasks_bp, users_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(tasks_bp)
    app.register_blueprint(stats_bp)
    app.register_blueprint(filters_bp)


def _register_routes(app):
    @app.route("/")
    def index():
        try:
            return send_from_directory(app.static_folder, "index.html")
        except Exception:
            return jsonify({"error": "Frontend not built. Run: cd frontend && npm run build"}), 503

    @app.route("/auth")
    def auth_page():
        try:
            return send_from_directory(app.static_folder, "index.html")
        except Exception:
            return jsonify({"error": "Frontend not built. Run: cd frontend && npm run build"}), 503

    @app.route("/manifest.json")
    def manifest():
        return send_from_directory(app.static_folder, "manifest.json")

    @app.route("/sw.js")
    def sw():
        return send_from_directory(app.static_folder, "sw.js")

    @app.route("/health")
    def health():
        return jsonify({"status": "healthy"}), 200

    @app.route("/ready")
    def ready():
        try:
            db.session.execute(db.text("SELECT 1"))
            return jsonify({"status": "ready"}), 200
        except Exception:
            return jsonify({"status": "not_ready"}), 503

    @app.route("/<path:path>")
    def serve_spa(path):
        api_prefixes = (
            "auth",
            "tasks",
            "users",
            "stats",
            "activity",
            "tags",
            "filters",
            "templates",
            "dependencies",
            "subtasks",
            "socket.io",
        )
        if path.startswith(api_prefixes):
            return jsonify({"error": "Not found"}), 404
        try:
            return send_from_directory(app.static_folder, path)
        except Exception:
            return send_from_directory(app.static_folder, "index.html")

    @app.errorhandler(404)
    def not_found(_):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(500)
    def server_error(error):
        logger.error("Server error: %s", error)
        return jsonify({"error": "Internal server error"}), 500

    @app.before_request
    def log_request():
        logger.info("Request: %s %s", request.method, request.path)


def _register_scheduler(app):
    if not app.config.get("ENABLE_SCHEDULER", True):
        return
    if scheduler.get_job("check_deadlines"):
        return
    scheduler.add_job(id="check_deadlines", func=check_deadlines, trigger="interval", days=1)
    scheduler.start()


def create_app(config_object=Config):
    app = Flask(__name__, static_folder="frontend/dist", static_url_path="/")
    app.config.from_object(config_object)
    _configure_app(app)

    db.init_app(app)
    mail.init_app(app)
    migrate.init_app(app, db)
    socketio.init_app(app, cors_allowed_origins=app.config["CORS_ORIGINS"])
    if app.config.get("ENABLE_SCHEDULER", True):
        scheduler.init_app(app)

    _register_blueprints(app)
    _register_routes(app)

    with app.app_context():
        if app.config.get("ENABLE_SCHEDULER", True):
            _register_scheduler(app)

    return app


app = create_app()

if __name__ == "__main__":
    socketio.run(
        app,
        debug=True,
        host="0.0.0.0",
        port=5000,
        allow_unsafe_werkzeug=True,
        use_reloader=False,
    )
