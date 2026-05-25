"""Request-scoped authorization context for TaskMaster2.

Registers a `before_request` hook that resolves who the caller is and
which team they're scoped to. The decorators in `auth_decorators.py`
and helpers in `scoping.py` read from `flask.g` populated here.

Behaviour per design 4.2:
- Public paths (/health, /ready, /version, /auth/login, /auth/signup,
  /auth/logout) bypass the layer entirely.
- Authenticated requests:
    1. Look up the user by `session['user_id']`.
    2. Compare `session['session_version']` to the live user record.
       Mismatch (e.g. user moved between teams, R7.7) -> 401, clear session.
    3. If the user has a team, ensure it isn't archived (R5.5).
       Archived -> 403 with code `team_archived`, clear session.
    4. Populate `g.current_user`, `g.current_team_id`, `g.current_role`.
- Unauthenticated requests: do nothing; the route's @require_* decorator
  will reject with 401 if needed.
"""

from __future__ import annotations

from flask import Flask, g, jsonify, request, session

# Paths exempt from auth layer (Public_Endpoints + auth flow itself).
# The auth flow needs to run BEFORE the user is fully resolved — login/signup
# must work without a session, logout needs to clear without re-validating.
PUBLIC_PATHS: frozenset[str] = frozenset({"/health", "/ready", "/version"})
PUBLIC_PREFIXES: tuple[str, ...] = (
    "/auth/login",
    "/auth/signup",
    "/auth/logout",
    "/auth/signup-info",  # added in Task 12
    "/socket.io",  # WebSocket negotiation — handled by socketio handlers, not Flask
)


def _is_public(path: str) -> bool:
    if path in PUBLIC_PATHS:
        return True
    return any(path.startswith(prefix) for prefix in PUBLIC_PREFIXES)


def register_auth_layer(app: Flask) -> None:
    """Wire the before_request hook into the Flask app."""

    # Imported here to avoid circular import at module load time
    # (utils package gets imported during app.py module import).
    from models import Team, User, db

    @app.before_request
    def _load_session_principal():
        if _is_public(request.path):
            return None

        user_id = session.get("user_id")
        if not user_id:
            # No session yet — let the route's @require_* decorator decide
            # whether 401 is appropriate. Static frontend paths land here too.
            return None

        user = db.session.get(User, user_id)
        if user is None:
            session.clear()
            return jsonify({"error": "Sesja jest nieprawidłowa", "code": "session_invalid"}), 401

        # Stale session marker (R7.7, R25.3): user was moved or team archived
        # since the cookie was issued. Force re-login.
        if user.session_version != session.get("session_version", 0):
            session.clear()
            return jsonify({"error": "Sesja jest nieaktualna", "code": "session_stale"}), 401

        # Team archival check (R5.5). super_admin has team_id=NULL so skipped.
        if user.team_id is not None:
            team = db.session.get(Team, user.team_id)
            if team is None or team.archived:
                session.clear()
                return jsonify({
                    "error": "Zespół jest niedostępny",
                    "code": "team_archived",
                }), 403

        g.current_user = user
        g.current_team_id = user.team_id
        g.current_role = user.role
        return None
