import logging
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.middleware.proxy_fix import ProxyFix

load_dotenv()
load_dotenv(".env.local", override=True)

from config import Config
from extensions import mail, migrate, scheduler, socketio
from jobs.deadline_notifier import check_deadlines
from models import User, db
from utils.logging_config import register_request_logging, setup_logging

logger = logging.getLogger(__name__)

# Wersja aplikacji - moze byc nadpisana przez build (ARG/ENV w Dockerfile)
APP_VERSION = os.environ.get("APP_VERSION", "dev")
APP_GIT_SHA = os.environ.get("APP_GIT_SHA", "unknown")
APP_BUILD_TIME = os.environ.get("APP_BUILD_TIME", "unknown")


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

    # Bezpieczne cookies sesji. Secure=True wymaga HTTPS (Nginx termuje TLS).
    # W lokalnym devie bez Nginx ustaw SESSION_COOKIE_SECURE=False w .env.local.
    secure_cookies = os.environ.get("SESSION_COOKIE_SECURE", "true").lower() == "true"
    app.config.setdefault("SESSION_COOKIE_HTTPONLY", True)
    app.config.setdefault("SESSION_COOKIE_SAMESITE", "Lax")
    app.config.setdefault("SESSION_COOKIE_SECURE", secure_cookies)

    CORS(app, supports_credentials=True, origins=app.config["CORS_ORIGINS"])


def _register_blueprints(app):
    from routes import auth_bp, filters_bp, notifications_bp, stats_bp, tasks_bp, users_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(tasks_bp)
    app.register_blueprint(stats_bp)
    app.register_blueprint(filters_bp)
    app.register_blueprint(notifications_bp)


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
        return jsonify({
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }), 200

    @app.route("/version")
    def version():
        return jsonify({
            "version": APP_VERSION,
            "git_sha": APP_GIT_SHA,
            "build_time": APP_BUILD_TIME,
            "python": os.environ.get("PYTHON_VERSION", "3.11"),
        }), 200

    @app.route("/ready")
    def ready():
        checks = {"database": False, "socketio": socketio is not None}
        try:
            db.session.execute(text("SELECT 1"))
            checks["database"] = True
        except Exception:
            logger.exception("Readiness database check failed")

        status_code = 200 if all(checks.values()) else 503
        status = "ready" if status_code == 200 else "not_ready"
        return jsonify({
            "status": status,
            "checks": checks,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }), status_code

    @app.route("/<path:path>")
    def serve_spa(path):
        api_prefixes = (
            "auth",
            "tasks",
            "projects",
            "users",
            "stats",
            "activity",
            "tags",
            "filters",
            "templates",
            "dependencies",
            "subtasks",
            "notifications",
            "socket.io",
            "version",
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


def _register_scheduler(app):
    if not app.config.get("ENABLE_SCHEDULER", True):
        return
    if scheduler.get_job("check_deadlines"):
        return
    scheduler.add_job(id="check_deadlines", func=check_deadlines, trigger="interval", days=1)
    scheduler.start()


def _ensure_default_admin(app):
    username = app.config.get("DEFAULT_ADMIN_USERNAME")
    password = app.config.get("DEFAULT_ADMIN_PASSWORD")
    email = app.config.get("DEFAULT_ADMIN_EMAIL")
    if not username or not password or not email:
        return

    try:
        user = User.query.filter_by(username=username).first()
        if user is None:
            user = User(username=username, email=email, role="admin")
            db.session.add(user)
        else:
            user.role = "admin"
            user.email = user.email or email
        user.set_password(password)
        db.session.commit()
        logger.info("Default admin account is ready: %s", username)
    except SQLAlchemyError:
        db.session.rollback()
        logger.info("Default admin bootstrap skipped until database schema is ready")


def create_app(config_object=Config):
    app = Flask(__name__, static_folder="frontend/dist", static_url_path="/")
    app.config.from_object(config_object)
    _configure_app(app)
    setup_logging(app)

    # Trust X-Forwarded-* headers from one reverse proxy (Nginx).
    # Pozwala Flaskowi poprawnie wykrywac HTTPS i prawdziwe IP klienta.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

    db.init_app(app)
    mail.init_app(app)
    migrate.init_app(app, db)
    socketio.init_app(app, cors_allowed_origins=app.config["CORS_ORIGINS"])
    if app.config.get("ENABLE_SCHEDULER", True):
        scheduler.init_app(app)

    _register_blueprints(app)
    _register_routes(app)
    register_request_logging(app)

    with app.app_context():
        if app.config.get("ENABLE_SCHEDULER", True):
            _register_scheduler(app)
        _ensure_default_admin(app)

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
