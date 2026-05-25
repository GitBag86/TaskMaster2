"""Helpers that enforce team_id scoping on database queries.

Every team-scoped route uses these to apply the same isolation invariant
without each handler re-implementing `WHERE team_id = ...` filters.

See design 4.4 and Property 1 (Isolation invariant) in design.md.

Note: in Task 4 we only ship the helpers themselves. They start being
USED by route handlers in Task 8+ as we refactor each resource. Until
then they are dormant — calling them on a request with no `g.current_team_id`
returns `query.filter(False)` which is a safe-default empty result set.
"""

from __future__ import annotations

from typing import Optional, Type, TypeVar

from flask import g
from sqlalchemy.orm import Query

from models import db

T = TypeVar("T")


def team_scoped(query: Query, model: Type[T], *, team_id: Optional[int] = None) -> Query:
    """Add `WHERE model.team_id = <current team>` to a query.

    Args:
        query: any existing Query (e.g. `Task.query` or `db.session.query(Task)`)
        model: the model class — must have a `team_id` column
        team_id: optional override; when None we read `g.current_team_id`
                 (set by the auth-layer before_request hook, see auth_layer.py)

    Returns:
        The same query with an extra filter clause. If no team is active
        (super_admin on a regular endpoint, or anonymous request that slipped
        through somehow), returns a filter that always evaluates False — i.e.
        the safe default is "see nothing" rather than "see everything".
    """
    tid = team_id if team_id is not None else g.get("current_team_id")
    if tid is None:
        # Super_admin on a standard endpoint -> empty result (R9.6).
        # Also covers any defensive case where the auth layer didn't run.
        return query.filter(False)
    return query.filter(model.team_id == tid)


def get_team_resource_or_404(model: Type[T], resource_id: int) -> Optional[T]:
    """Fetch a single resource scoped to the caller's team.

    Returns:
        The resource if (a) it exists AND (b) belongs to the caller's team.
        Returns None in every other case — including when the resource exists
        but belongs to another team. Routes call `if obj is None: abort(404)`
        so cross-team probes are indistinguishable from non-existent ids
        (R9.4 — prevents enumeration leaks).

    A super_admin call (no team_id in g) on a standard endpoint always
    yields None — consistent with R9.6.
    """
    obj = db.session.get(model, resource_id)
    if obj is None:
        return None

    # Models without team_id (Public_Endpoints aside, none expected) bypass
    # this check — but most callers pass team-scoped models.
    obj_team_id = getattr(obj, "team_id", None)
    if obj_team_id is None:
        return obj

    if obj_team_id != g.get("current_team_id"):
        return None

    return obj
