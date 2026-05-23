"""Centralna konfiguracja logowania dla TaskMaster2.

Cele:
- Strukturalne logi: timestamp, level, logger, request_id, user_id, message.
- Per-request log z czasem, statusem, IP, userem.
- Stack trace przy nieobsluzonych wyjatkach.
- Stdout (dla `docker compose logs`) + plik rotacyjny (logs/app.log).
- Honoruje `LOG_LEVEL` ze srodowiska (default INFO).
"""

from __future__ import annotations

import logging
import os
import sys
import time
import uuid
from logging.handlers import RotatingFileHandler
from pathlib import Path

from flask import Flask, g, has_request_context, request, session


class ContextFilter(logging.Filter):
    """Wstrzykuje request_id i user_id do kazdego rekordu logu."""

    def filter(self, record: logging.LogRecord) -> bool:
        if has_request_context():
            record.request_id = getattr(g, "request_id", "-")
            record.user_id = session.get("user_id", "-") if session else "-"
        else:
            record.request_id = "-"
            record.user_id = "-"
        return True


def _build_formatter() -> logging.Formatter:
    fmt = (
        "%(asctime)s.%(msecs)03d %(levelname)-7s "
        "[req=%(request_id)s user=%(user_id)s] "
        "%(name)s: %(message)s"
    )
    return logging.Formatter(fmt, datefmt="%Y-%m-%d %H:%M:%S")


def setup_logging(app: Flask) -> None:
    """Konfiguruje root logger i logger Flaska."""
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    formatter = _build_formatter()
    context_filter = ContextFilter()

    # Stdout handler - widoczny przez `docker compose logs`
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(formatter)
    stdout_handler.addFilter(context_filter)

    handlers: list[logging.Handler] = [stdout_handler]

    # Plik z rotacja (10 MB x 5 plikow = max 50 MB historii)
    log_dir = Path(os.environ.get("LOG_DIR", "logs"))
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            log_dir / "app.log",
            maxBytes=10 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        file_handler.addFilter(context_filter)
        handlers.append(file_handler)
    except OSError as exc:
        # Brak pisania do logs/ nie powinno wywalac aplikacji
        sys.stderr.write(f"[logging] Cannot open log file in {log_dir}: {exc}\n")

    # Reset root loggera (Flask/Werkzeug moga juz cos zarejestrowac)
    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(level)
    for handler in handlers:
        root.addHandler(handler)

    # Mniej halasu od bibliotek
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    logging.getLogger("apscheduler").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)

    # Logger samej aplikacji
    app.logger.handlers.clear()
    app.logger.propagate = True
    app.logger.setLevel(level)

    app.logger.info(
        "Logging configured: level=%s, file=%s",
        level_name,
        log_dir / "app.log",
    )


def register_request_logging(app: Flask) -> None:
    """Rejestruje hooki zapisujace szczegoly kazdego requestu."""

    access_logger = logging.getLogger("taskmaster.access")
    error_logger = logging.getLogger("taskmaster.errors")

    @app.before_request
    def _start_request() -> None:
        # Honoruj X-Request-ID od Nginx, jesli jest
        incoming = request.headers.get("X-Request-ID")
        g.request_id = incoming or uuid.uuid4().hex[:12]
        g.request_started_at = time.perf_counter()

    @app.after_request
    def _log_request(response):
        # Pomijaj health/ready zeby nie zasmiecac logow co 30s (Docker healthcheck)
        if request.path in ("/health", "/ready"):
            return response

        try:
            duration_ms = (time.perf_counter() - g.request_started_at) * 1000.0
        except AttributeError:
            duration_ms = 0.0

        # Propaguj request_id do klienta - przydatne przy supportcie
        response.headers["X-Request-ID"] = getattr(g, "request_id", "-")

        access_logger.info(
            "%s %s -> %d (%.1f ms) ip=%s ua=%r",
            request.method,
            request.full_path.rstrip("?"),
            response.status_code,
            duration_ms,
            request.remote_addr or "-",
            request.headers.get("User-Agent", "-")[:120],
        )
        return response

    @app.errorhandler(Exception)
    def _handle_unexpected(exc: Exception):
        # Flask sam pochwyci HTTPException, my logujemy reszte z pelnym stackiem
        from werkzeug.exceptions import HTTPException

        if isinstance(exc, HTTPException):
            return exc

        error_logger.exception(
            "Unhandled exception on %s %s: %s",
            request.method,
            request.path,
            exc,
        )
        from flask import jsonify

        return jsonify({"error": "Internal server error"}), 500
