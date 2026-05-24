"""Role-based access control decorators for TaskMaster2.

These wrap route handlers to enforce the three-tier role hierarchy
introduced by team-workspaces (R2):

    super_admin > manager > user

The legacy `@login_required` (in routes/auth.py) becomes an alias for
`require_team_member` for backwards compatibility while we incrementally
migrate routes (Tasks 8-13).

All decorators rely on the `before_request` hook in `utils/auth_layer.py`
having populated `g.current_user`, `g.current_team_id`, `g.current_role`.
If g is empty (anonymous), 401 is returned. If role doesn't match, 403.

See design section 4.3.
"""

from __future__ import annotations

from functools import wraps
from typing import Callable

from flask import g, jsonify


def require_role(*roles: str) -> Callable:
    """Require the caller to have one of the listed roles.

    Example:
        @require_role('manager', 'super_admin')
        def some_endpoint(): ...

    Returns 401 when not authenticated, 403 when role doesn't match.
    """

    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not g.get("current_user"):
                return jsonify({"error": "Nie jesteś zalogowany"}), 401
            if g.get("current_role") not in roles:
                return jsonify({"error": "Brak uprawnień"}), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator


# Convenience aliases — most routes use one of these directly.

def require_team_member(fn: Callable) -> Callable:
    """Manager OR user — anyone bound to a team. The default for team-scoped routes."""
    return require_role("manager", "user")(fn)


def require_super_admin(fn: Callable) -> Callable:
    """Only super_admin — used for /admin/teams/* and platform-wide endpoints."""
    return require_role("super_admin")(fn)


def require_manager_or_super(fn: Callable) -> Callable:
    """Manager (within their team) or super_admin (cross-team admin endpoints)."""
    return require_role("manager", "super_admin")(fn)
