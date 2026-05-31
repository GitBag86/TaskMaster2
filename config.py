import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
INSTANCE_DB_PATH = os.path.join(BASE_DIR, "instance", "tasks.db")


def normalize_database_uri(uri):
    if uri.startswith("postgres://"):
        uri = f"postgresql://{uri.removeprefix('postgres://')}"
    if uri.startswith("postgresql://"):
        return f"postgresql+psycopg://{uri.removeprefix('postgresql://')}"
    return uri


def parse_cors_origins(value):
    return [origin.strip() for origin in value.split(",") if origin.strip()]


def parse_bool(value):
    return str(value).lower() == "true"


def default_session_cookie_secure():
    configured = os.environ.get("SESSION_COOKIE_SECURE")
    if configured is not None:
        return parse_bool(configured)
    return os.environ.get("FLASK_ENV", "development").lower() == "production"


class Config:
    # Database: SQLite by default (simplest for local Docker)
    # Override with DATABASE_URL or SQLALCHEMY_DATABASE_URI environment variables if needed
    SQLALCHEMY_DATABASE_URI = normalize_database_uri(
        os.environ.get(
            "SQLALCHEMY_DATABASE_URI",
            os.environ.get("DATABASE_URL", f"sqlite:///{INSTANCE_DB_PATH}")
        )
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-me")
    CORS_ORIGINS = parse_cors_origins(os.environ.get("CORS_ORIGINS", "http://localhost:5000"))
    SESSION_COOKIE_SECURE = default_session_cookie_secure()
    SESSION_COOKIE_SAMESITE = os.environ.get("SESSION_COOKIE_SAMESITE", "Lax")
    ENABLE_SCHEDULER = os.environ.get("ENABLE_SCHEDULER", "true").lower() == "true"
    PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
    DEFAULT_ADMIN_USERNAME = os.environ.get("DEFAULT_ADMIN_USERNAME", "admin")
    DEFAULT_ADMIN_PASSWORD = os.environ.get("DEFAULT_ADMIN_PASSWORD", "dakos1admin2")
    DEFAULT_ADMIN_EMAIL = os.environ.get("DEFAULT_ADMIN_EMAIL", "admin@taskmaster.local")
    DEFAULT_ADMIN_RESET_PASSWORD = os.environ.get("DEFAULT_ADMIN_RESET_PASSWORD", "false").lower() == "true"

    # Team workspaces (multi-tenancy)
    # SIGNUP_MODE: 'disabled' | 'invite_only' | 'default_team'
    #   disabled    - public POST /auth/signup returns 403 signup_disabled
    #   invite_only - signup requires a valid TeamInvite token (default)
    #   default_team - new accounts land in the Default team with role=user
    SIGNUP_MODE = os.environ.get("SIGNUP_MODE", "invite_only").strip().lower()
    INVITE_TOKEN_TTL_DAYS = int(os.environ.get("INVITE_TOKEN_TTL_DAYS", 7))
    SUPER_ADMIN_LANDING = os.environ.get("SUPER_ADMIN_LANDING", "/admin/teams")

    # Email configuration (optional)
    MAIL_SERVER = os.environ.get("MAIL_SERVER")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", 587))
    MAIL_USE_TLS = os.environ.get("MAIL_USE_TLS", "True").lower() == "true"
    MAIL_USE_SSL = os.environ.get("MAIL_USE_SSL", "False").lower() == "true"
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD")
    MAIL_DEFAULT_SENDER = os.environ.get("MAIL_DEFAULT_SENDER")
    MAIL_SUPPRESS_SEND = os.environ.get("MAIL_SUPPRESS_SEND", "False").lower() == "true"
    MAIL_TIMEOUT = int(os.environ.get("MAIL_TIMEOUT", 10))
    MAIL_ASYNC = os.environ.get("MAIL_ASYNC", "True").lower() == "true"


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SECRET_KEY = "test-secret-key"
    SESSION_COOKIE_SECURE = False
    ENABLE_SCHEDULER = False
    PUBLIC_BASE_URL = ""
    DEFAULT_ADMIN_USERNAME = "admin"
    DEFAULT_ADMIN_PASSWORD = "dakos1admin2"
    DEFAULT_ADMIN_EMAIL = "admin@taskmaster.local"
    DEFAULT_ADMIN_RESET_PASSWORD = False
    MAIL_SUPPRESS_SEND = True
    # Bootstrap admin defaults isolated from any .env values that may
    # be loaded into the process. Tests assert against these constants.
    DEFAULT_ADMIN_USERNAME = "admin"
    DEFAULT_ADMIN_PASSWORD = "dakos1admin2"
    DEFAULT_ADMIN_EMAIL = "admin@taskmaster.local"
