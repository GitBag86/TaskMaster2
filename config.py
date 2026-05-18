import os
import urllib.parse

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
INSTANCE_DB_PATH = os.path.join(BASE_DIR, "instance", "tasks.db")

class Config:
    # Database configuration: supports Cloud SQL (Postgres), standard Postgres, and SQLite
    # Priority: Cloud SQL socket > DATABASE_URL > SQLite
    
    # Cloud SQL via Unix socket (Cloud Run + Cloud SQL Auth Proxy)
    INSTANCE_UNIX_SOCKET = os.environ.get("INSTANCE_UNIX_SOCKET", "")
    if INSTANCE_UNIX_SOCKET:
        db_password = urllib.parse.quote_plus(os.environ.get("DB_PASSWORD", ""))
        db_name = os.environ.get("DB_NAME", "taskmaster_db")
        db_user = os.environ.get("DB_USER", "appuser")
        SQLALCHEMY_DATABASE_URI = f"postgresql://{db_user}:{db_password}@/{db_name}?host={INSTANCE_UNIX_SOCKET}"
    # Standard Postgres connection string (for traditional Postgres or Cloud SQL with public IP)
    elif os.environ.get("DATABASE_URL"):
        SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL")
    # Fallback to SQLite for local development
    else:
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{INSTANCE_DB_PATH}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-me")
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5000").split(",")
    ENABLE_SCHEDULER = os.environ.get("ENABLE_SCHEDULER", "true").lower() == "true"

    MAIL_SERVER = os.environ.get("MAIL_SERVER")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", 587))
    MAIL_USE_TLS = os.environ.get("MAIL_USE_TLS", "True").lower() == "true"
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD")
    MAIL_DEFAULT_SENDER = os.environ.get("MAIL_DEFAULT_SENDER")


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SECRET_KEY = "test-secret-key"
    ENABLE_SCHEDULER = False
