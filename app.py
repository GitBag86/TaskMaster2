"""
TaskMaster2 — Flask application factory.

Copyright © 2026 Krzysztof Graczyk. All rights reserved.
This software is proprietary. See LICENSE for terms.
"""

import logging
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_wtf.csrf import generate_csrf
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.middleware.proxy_fix import ProxyFix

load_dotenv()
load_dotenv(".env.local", override=True)

from config import Config
from extensions import csrf, limiter, mail, migrate, scheduler, socketio
from jobs.deadline_notifier import check_deadlines
from models import User, db
import sentry_sdk
from utils.errors import TaskMasterError
from utils.logging_config import register_request_logging, setup_logging
from utils.auth_layer import register_auth_layer
from utils.realtime import register_socketio_handlers

logger = logging.getLogger(__name__)

# Wersja aplikacji - moze byc nadpisana przez build (ARG/ENV w Dockerfile)
APP_VERSION = os.environ.get("APP_VERSION", "1.0")
APP_GIT_SHA = os.environ.get("APP_GIT_SHA", "unknown")
APP_BUILD_TIME = os.environ.get("APP_BUILD_TIME", "unknown")


def _configure_app(app):
    secret_key = app.config.get("SECRET_KEY")
    if not secret_key:
        raise RuntimeError(
            "SECRET_KEY environment variable is not set. "
            "Generate one with: python -c 'import secrets; print(secrets.token_hex(32))'"
        )
    if secret_key == "dev-secret-key-change-me":
        logger.warning(
            "SECRET_KEY is still the insecure development default! "
            "Set SECRET_KEY to a random 64-char hex string in production. "
            "Generate one with: python -c 'import secrets; print(secrets.token_hex(32))'"
        )

    os.makedirs(app.instance_path, exist_ok=True)
    uri = app.config.get("SQLALCHEMY_DATABASE_URI", "")
    if not uri:
        # No URI configured at all — build one with an absolute path
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(app.instance_path, "tasks.db")
    elif uri.startswith("sqlite:///") and not uri.startswith("sqlite:////") and ":memory:" not in uri:
        # Relative SQLite path — resolve to absolute (relative to app.py dir) so it works regardless of CWD
        rel_path = uri.removeprefix("sqlite:///")
        abs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), rel_path))
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + abs_path

    # Bezpieczne cookies sesji. Secure=True wymaga HTTPS (Nginx termuje TLS).
    # W lokalnym devie bez Nginx ustaw SESSION_COOKIE_SECURE=False w .env.local.
    app.config.setdefault("SESSION_COOKIE_HTTPONLY", True)
    app.config.setdefault("SESSION_COOKIE_SAMESITE", "Lax")
    app.config.setdefault("SESSION_COOKIE_SECURE", True)

    CORS(app, supports_credentials=True, origins=app.config["CORS_ORIGINS"])


def _register_blueprints(app):
    from routes import admin_bp, auth_bp, filters_bp, invites_bp, notifications_bp, projects_bp, stats_bp, tasks_bp, users_bp

    app.register_blueprint(admin_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(tasks_bp)
    app.register_blueprint(stats_bp)
    app.register_blueprint(filters_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(invites_bp)
    app.register_blueprint(projects_bp)

    # CSRF exemption for auth endpoints is applied via @csrf.exempt decorator
    # in routes/auth.py so that exemptions travel with the function definition.
    pass


def _register_routes(app):
    @app.route("/")
    def index():
        try:
            return send_from_directory(app.static_folder, "index.html")
        except (FileNotFoundError, OSError):
            return jsonify({"error": "Frontend not built. Run: cd frontend && npm run build"}), 503

    @app.route("/auth")
    def auth_page():
        try:
            return send_from_directory(app.static_folder, "index.html")
        except (FileNotFoundError, OSError):
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
        except SQLAlchemyError:
            logger.exception("Readiness database check failed")

        status_code = 200 if all(checks.values()) else 503
        status = "ready" if status_code == 200 else "not_ready"
        return jsonify({
            "status": status,
            "checks": checks,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }), status_code

    @app.route("/csrf-token")
    def get_csrf_token():
        return jsonify({"csrf_token": generate_csrf()})

    @app.route("/<path:path>")
    def serve_spa(path):
        # Pure-API prefixes — these are always JSON, never SPA routes.
        api_prefixes = (
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
            "project-templates",
        )
        if path.startswith(api_prefixes):
            return jsonify({"error": "Not found"}), 404

        # Mixed prefixes — used by both the SPA (e.g. /admin/teams page) and
        # the JSON API (e.g. POST /admin/teams). Decide based on the request:
        # - browser navigation / refresh → Accept includes text/html → serve SPA
        # - fetch() from the SPA → no text/html in Accept → return JSON 404
        mixed_prefixes = ("auth", "admin", "team")
        if path.startswith(mixed_prefixes):
            accept = request.headers.get("Accept", "")
            if "text/html" not in accept:
                return jsonify({"error": "Not found"}), 404

        # Static asset (JS chunk, image, etc.) if it exists, otherwise fall
        # through to index.html so React Router can handle the route.
        # We avoid `send_from_directory` raising NotFound (which Flask would
        # turn into a 404 via the errorhandler) by checking with os.path.isfile.
        candidate = os.path.normpath(os.path.join(app.static_folder, path))
        if candidate.startswith(os.path.abspath(app.static_folder)) and os.path.isfile(candidate):
            return send_from_directory(app.static_folder, path)
        return send_from_directory(app.static_folder, "index.html")

    @app.errorhandler(404)
    def not_found(_):
        # Browser navigation that doesn't match any registered route should
        # still receive the SPA shell so React Router can render the matching
        # client-side route (e.g. /today, /admin/teams).
        accept = request.headers.get("Accept", "")
        if "text/html" in accept:
            try:
                return send_from_directory(app.static_folder, "index.html")
            except (FileNotFoundError, OSError):
                pass
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(TaskMasterError)
    def _handle_app_error(exc: TaskMasterError):
        # Application-level errors with a stable code + HTTP status (R30, see utils/errors.py)
        return jsonify({"error": exc.message, "code": exc.code}), exc.http_status

    @app.errorhandler(403)
    def _handle_forbidden(_):
        return jsonify({"error": "Brak uprawnień"}), 403

    @app.errorhandler(429)
    def _handle_rate_limit(_):
        return jsonify({"error": "Zbyt wiele żądań — spróbuj później"}), 429

    @app.errorhandler(500)
    def _handle_internal_error(_):
        return jsonify({"error": "Wewnętrzny błąd serwera"}), 500


def _register_scheduler(app):
    if not app.config.get("ENABLE_SCHEDULER", True):
        return
    if scheduler.get_job("check_deadlines"):
        return
    scheduler.add_job(id="check_deadlines", func=check_deadlines, args=[app], trigger="interval", days=1)
    scheduler.start()


def _ensure_default_admin(app):
    username = app.config.get("DEFAULT_ADMIN_USERNAME")
    password = app.config.get("DEFAULT_ADMIN_PASSWORD")
    email = app.config.get("DEFAULT_ADMIN_EMAIL")
    reset_password = app.config.get("DEFAULT_ADMIN_RESET_PASSWORD", False)
    if not username or not password or not email:
        return

    try:
        user = User.query.filter_by(username=username).first()
        if user is None:
            # Brand-new database: create the bootstrap account directly as super_admin
            # with team_id=None (R3.4).
            user = User(username=username, email=email, role="super_admin", team_id=None)
            user.set_password(password)
            db.session.add(user)
            logger.info("Default admin account created: %s", username)
        else:
            # Existing account: ensure it stays super_admin and detached from any team.
            # The migration in 81d661ec5395 already promoted legacy 'admin' → 'super_admin'
            # for the bootstrap user; this is just defensive idempotency.
            user.role = "super_admin"
            user.team_id = None
            user.email = user.email or email
            if reset_password:
                user.set_password(password)
                logger.info("Default admin password reset: %s", username)
            else:
                logger.info("Default admin account is ready without password reset: %s", username)
        db.session.commit()
        logger.info("Default super-admin account is ready: %s", username)
    except SQLAlchemyError:
        db.session.rollback()
        logger.info("Default admin bootstrap skipped until database schema is ready")


def _log_mail_status(app):
    if app.config.get("TESTING"):
        return

    server = app.config.get("MAIL_SERVER")
    suppress = app.config.get("MAIL_SUPPRESS_SEND")
    sender = app.config.get("MAIL_DEFAULT_SENDER") or app.config.get("MAIL_USERNAME")

    if suppress:
        app.logger.warning(
            "MAIL_SUPPRESS_SEND=True - email notifications are disabled. "
            "Set MAIL_SUPPRESS_SEND=False (or remove it) to enable delivery."
        )
        return

    if not server:
        app.logger.warning(
            "MAIL_SERVER is not configured - email notifications will be skipped silently. "
            "Set MAIL_SERVER, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD and MAIL_DEFAULT_SENDER."
        )
        return

    if not sender:
        app.logger.warning(
            "Mail is configured but MAIL_DEFAULT_SENDER (and MAIL_USERNAME) are empty - "
            "outbound emails will be rejected by Flask-Mail."
        )
        return

    app.logger.info(
        "Mail configured: server=%s port=%s tls=%s sender=%s",
        server,
        app.config.get("MAIL_PORT"),
        app.config.get("MAIL_USE_TLS"),
        sender,
    )


def create_app(config_object=Config):
    app = Flask(__name__, static_folder="frontend/dist", static_url_path="/")
    app.config.from_object(config_object)
    _configure_app(app)
    setup_logging(app)

    # Trust X-Forwarded-* headers from one reverse proxy (Nginx).
    # Pozwala Flaskowi poprawnie wykrywac HTTPS i prawdziwe IP klienta.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

    sentry_dsn = os.environ.get("SENTRY_DSN")
    if sentry_dsn:
        sentry_sdk.init(
            dsn=sentry_dsn,
            traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            environment=os.environ.get("FLASK_ENV", "production"),
            release=APP_VERSION,
        )

    db.init_app(app)
    mail.init_app(app)
    limiter.init_app(app)
    migrate.init_app(app, db)
    csrf.init_app(app)
    socketio.init_app(app, cors_allowed_origins=app.config["CORS_ORIGINS"])
    register_socketio_handlers()
    if app.config.get("ENABLE_SCHEDULER", True):
        scheduler.init_app(app)

    _register_blueprints(app)
    _register_routes(app)
    register_auth_layer(app)
    register_request_logging(app)
    _log_mail_status(app)

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
