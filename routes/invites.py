import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from flask import current_app, g, jsonify, request

from models import TeamInvite, db
from routes import invites_bp
from routes.auth import login_required


def hash_invite_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def utcnow_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def manager_only_response():
    if g.get("current_role") != "manager" or g.get("current_team_id") is None:
        return jsonify({"error": "Tylko manager może zarządzać zaproszeniami"}), 403
    return None


@invites_bp.route("/team/invites", methods=["GET"])
@login_required
def list_invites():
    error = manager_only_response()
    if error:
        return error

    invites = (
        TeamInvite.query
        .filter_by(team_id=g.get("current_team_id"), consumed_at=None)
        .order_by(TeamInvite.created_at.desc())
        .all()
    )
    return jsonify({"invites": [invite.to_dict() for invite in invites]})


@invites_bp.route("/team/invites", methods=["POST"])
@login_required
def create_invite():
    error = manager_only_response()
    if error:
        return error

    payload = request.get_json() or {}
    default_role = payload.get("default_role") or payload.get("role") or "user"
    if default_role != "user":
        return jsonify({"error": "Manager może wystawić zaproszenie tylko z rolą user"}), 400

    raw_token = secrets.token_urlsafe(32)
    ttl_days = current_app.config.get("INVITE_TOKEN_TTL_DAYS", 7)
    invite = TeamInvite(
        team_id=g.get("current_team_id"),
        token_hash=hash_invite_token(raw_token),
        created_by_id=g.current_user.id,
        expires_at=utcnow_naive() + timedelta(days=ttl_days),
        default_role="user",
    )
    db.session.add(invite)
    db.session.commit()

    data = invite.to_dict()
    data["raw_token"] = raw_token
    return jsonify(data), 201


@invites_bp.route("/team/invites/<int:invite_id>", methods=["DELETE"])
@login_required
def revoke_invite(invite_id):
    error = manager_only_response()
    if error:
        return error

    invite = db.session.get(TeamInvite, invite_id)
    if not invite or invite.team_id != g.get("current_team_id") or invite.consumed_at is not None:
        return jsonify({"error": "Not found"}), 404

    db.session.delete(invite)
    db.session.commit()
    return "", 204
