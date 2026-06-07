import hashlib

from flask import current_app, request, jsonify, session
from marshmallow import ValidationError
from routes import auth_bp
from models import db, Team, TeamInvite, User
from schemas import LoginSchema, SignupSchema
from utils.errors import InviteTokenInvalidError, SignupDisabledError, TeamArchivedError
import logging
from datetime import datetime, timezone

from extensions import limiter

logger = logging.getLogger(__name__)


def login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({"error": "Nie jesteś zalogowany"}), 401
        return f(*args, **kwargs)
    return decorated_function

@auth_bp.route('/signup', methods=['POST'])
@limiter.limit("5 per minute")
def signup():
    data = request.get_json()
    schema = SignupSchema()
    try:
        validated = schema.load(data)
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    username = validated.get('username')
    password = validated.get('password')

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Użytkownik już istnieje"}), 400

    email = validated.get('email', '')
    if not email:
        email = None

    target_team = None
    target_role = 'user'
    invite = None
    mode = current_app.config.get('SIGNUP_MODE', 'invite_only')
    if mode == 'disabled':
        raise SignupDisabledError()
    if mode == 'invite_only':
        invite = resolve_invite_token(validated.get('invite_token'))
        target_team = invite.team
        target_role = invite.default_role
    elif mode == 'default_team':
        target_team = Team.query.filter_by(name='Default').first()
        if target_team is None:
            return jsonify({"error": "Default team not found"}), 503
        if target_team.archived:
            raise TeamArchivedError()
    else:
        return jsonify({"error": "Nieprawidłowy tryb rejestracji"}), 500

    user = User(
        username=username,
        email=email,
        role=target_role,
        team_id=target_team.id,
        terms_accepted=validated.get('accept_terms', False),
        privacy_accepted=validated.get('accept_privacy', False),
        marketing_consent=validated.get('accept_marketing', False),
        consented_at=datetime.now(timezone.utc),
    )
    user.set_password(password)
    try:
        db.session.add(user)
        db.session.flush()
        if invite is not None:
            invite.consumed_at = datetime.now(timezone.utc).replace(tzinfo=None)
            invite.consumed_by_id = user.id
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("Signup failed while saving user '%s'", username)
        return jsonify({"error": "Nie udało się zapisać użytkownika w bazie danych"}), 500

    _establish_session(user)
    return jsonify({"message": "Rejestracja pomyślna", "user": user.to_dict(expand_team=True)}), 201


@auth_bp.route('/signup-info', methods=['GET'])
@limiter.limit("10 per minute")
def signup_info():
    mode = current_app.config.get('SIGNUP_MODE', 'invite_only')
    payload = {"mode": mode}
    raw_token = request.args.get('token')
    if raw_token:
        try:
            invite = resolve_invite_token(raw_token)
            payload["team_name"] = invite.team.name
        except InviteTokenInvalidError:
            payload["token_valid"] = False
        else:
            payload["token_valid"] = True
    return jsonify(payload)

@auth_bp.route('/login', methods=['POST'])
@limiter.limit("5 per minute")
def login():
    data = request.get_json()
    schema = LoginSchema()
    try:
        validated = schema.load(data)
    except ValidationError as err:
        return jsonify({"error": err.messages}), 400

    user = User.query.filter_by(username=validated['username']).first()
    if not user or not user.check_password(validated['password']):
        return jsonify({"error": "Błędne dane logowania"}), 401

    _establish_session(user)
    session.permanent = True
    return jsonify({"message": "Logowanie pomyślne", "user": user.to_dict(expand_team=True)})

@auth_bp.route('/logout', methods=['POST'])
def logout():
    # Atomically clear every key set by _establish_session.
    for key in ('user_id', 'team_id', 'role', 'session_version'):
        session.pop(key, None)
    return jsonify({"message": "Wylogowano"})


@auth_bp.route('/logout-all', methods=['POST'])
@login_required
def logout_all():
    """Bump session_version to invalidate ALL active sessions for this user.

    The next before_request hook (utils/auth_layer.py) will detect the
    version mismatch and return 401 session_stale on every concurrent session.
    """
    user_id = session.get('user_id')
    if user_id:
        user = db.session.get(User, user_id)
        if user:
            user.session_version += 1
            db.session.commit()
    # Clear the current session
    for key in ('user_id', 'team_id', 'role', 'session_version'):
        session.pop(key, None)
    return jsonify({"message": "Wylogowano ze wszystkich urządzeń"})

@auth_bp.route('/me', methods=['GET'])
@login_required
def get_current_user():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "Użytkownik nie znaleziony"}), 404
    # expand_team=True so the SPA gets `team` populated for the sidebar (Task 15).
    return jsonify(user.to_dict(expand_team=True))


def _establish_session(user):
    """Populate session keys consumed by the auth layer (utils/auth_layer.py).

    Called by login and signup. Stores user_id, team_id, role and session_version
    so the next request's before_request hook can validate them in O(1).
    """
    session['user_id'] = user.id
    session['team_id'] = user.team_id  # may be None for super_admin
    session['role'] = user.role
    session['session_version'] = user.session_version


def hash_invite_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def resolve_invite_token(raw_token):
    if not raw_token:
        raise InviteTokenInvalidError()
    invite = TeamInvite.query.filter_by(token_hash=hash_invite_token(raw_token)).first()
    if invite is None or not invite.is_active():
        raise InviteTokenInvalidError()
    if invite.team is None or invite.team.archived:
        raise TeamArchivedError()
    return invite
