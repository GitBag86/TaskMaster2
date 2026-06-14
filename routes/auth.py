import hashlib
import re
import secrets
import smtplib

from flask import current_app, request, jsonify, session
from marshmallow import ValidationError
from routes import auth_bp
from models import db, Team, TeamInvite, User, PasswordResetToken
from schemas import LoginSchema, SignupSchema, ProfileUpdateSchema
from utils.errors import InviteTokenInvalidError, SignupDisabledError, TeamArchivedError
import logging
from datetime import datetime, timezone
from sqlalchemy.exc import SQLAlchemyError

from extensions import limiter, csrf

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
@csrf.exempt
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
    except SQLAlchemyError:
        db.session.rollback()
        logger.exception("Signup failed while saving user '%s'", username)
        return jsonify({"error": "Nie udało się zapisać użytkownika w bazie danych"}), 500

    session.clear()  # L2: Prevent session fixation
    _establish_session(user)
    session.permanent = True
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
@csrf.exempt
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

    session.clear()  # L2: Prevent session fixation
    _establish_session(user)
    session.permanent = True
    return jsonify({"message": "Logowanie pomyślne", "user": user.to_dict(expand_team=True)})

@auth_bp.route('/logout', methods=['POST'])
@csrf.exempt
def logout():
    # Atomically clear every key set by _establish_session.
    for key in ('user_id', 'team_id', 'role', 'session_version'):
        session.pop(key, None)
    return jsonify({"message": "Wylogowano"})


@auth_bp.route('/logout-all', methods=['POST'])
@csrf.exempt
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

@auth_bp.route('/forgot-password', methods=['POST'])
@csrf.exempt
@limiter.limit("3 per minute")
def forgot_password():
    """Generate a password reset token and e-mail it to the user."""
    from datetime import timedelta

    from utils.email_sender import send_password_reset_email

    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "Adres e-mail jest wymagany"}), 400

    user = User.query.filter_by(email=email).first()
    # Don't reveal whether the email exists — always return 200
    if user is None:
        return jsonify({"message": "Jeśli konto o podanym adresie istnieje, otrzymasz e-mail z linkiem resetującym."}), 200

    raw_token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    ttl_hours = current_app.config.get("PASSWORD_RESET_TTL_HOURS", 1)

    reset = PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=ttl_hours),
    )
    db.session.add(reset)
    db.session.commit()

    try:
        send_password_reset_email(user, raw_token)
    except (smtplib.SMTPException, OSError):
        logger.exception("Failed to send password reset email to %s", email)
        # Always return the same generic message to prevent email enumeration.
        # The recipient won't know whether the account exists or the email failed,
        # but the error is logged server-side for operational awareness.

    return jsonify({"message": "Jeśli konto o podanym adresie istnieje, otrzymasz e-mail z linkiem resetującym."}), 200


@auth_bp.route('/reset-password', methods=['POST'])
@csrf.exempt
@limiter.limit("5 per minute")
def reset_password():
    """Reset password using a valid reset token."""
    data = request.get_json() or {}
    token = (data.get("token") or "").strip()
    new_password = data.get("password", "")

    if not token:
        return jsonify({"error": "Token jest wymagany"}), 400
    if len(new_password) < 6:
        return jsonify({"error": "Hasło musi mieć co najmniej 6 znaków"}), 400
    if not re.search(r'(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>_\-+=])', new_password):
        return jsonify({"error": "Hasło musi zawierać wielką literę, cyfrę i znak specjalny"}), 400

    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    reset = PasswordResetToken.query.filter_by(token_hash=token_hash).first()

    if reset is None or not reset.is_active():
        return jsonify({"error": "Token resetowania hasła jest nieprawidłowy lub wygasł"}), 400

    user = db.session.get(User, reset.user_id)
    if user is None:
        return jsonify({"error": "Użytkownik nie znaleziony"}), 404

    # Bump session_version to invalidate all existing sessions (H2)
    user.session_version += 1
    user.set_password(new_password)
    reset.consumed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.session.commit()

    return jsonify({"message": "Hasło zostało zmienione. Możesz się teraz zalogować."}), 200


@auth_bp.route('/me', methods=['GET', 'PUT'])
@login_required
def get_current_user():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "Użytkownik nie znaleziony"}), 404

    if request.method == 'PUT':
        data = request.get_json() or {}
        schema = ProfileUpdateSchema()
        try:
            validated = schema.load(data)
        except ValidationError as err:
            return jsonify({"error": err.messages}), 400

        email = validated.get('email', '').strip().lower() if validated.get('email') else ''
        if email and email != user.email:
            if User.query.filter(User.email == email, User.id != user.id).first():
                return jsonify({"error": "Ten adres e-mail jest już używany"}), 409
            user.email = email
        if 'marketing_consent' in validated:
            user.marketing_consent = bool(validated['marketing_consent'])
        db.session.commit()
        return jsonify(user.to_dict(expand_team=True))

    # expand_team=True so the SPA gets `team` populated for the sidebar (Task 15).
    return jsonify(user.to_dict(expand_team=True))


@auth_bp.route('/change-password', methods=['POST'])
@login_required
def change_password():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    data = request.get_json() or {}
    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')

    if not user.check_password(current_password):
        return jsonify({"error": "Obecne hasło jest nieprawidłowe"}), 403

    if len(new_password) < 6:
        return jsonify({"error": "Nowe hasło musi mieć co najmniej 6 znaków"}), 400
    if not re.search(r'(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>_\-+=])', new_password):
        return jsonify({"error": "Hasło musi zawierać wielką literę, cyfrę i znak specjalny"}), 400

    user.set_password(new_password)
    user.session_version += 1
    db.session.commit()
    _establish_session(user)

    return jsonify({"message": "Hasło zostało zmienione"}), 200


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
