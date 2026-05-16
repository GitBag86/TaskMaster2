from flask import request, jsonify, session
from marshmallow import ValidationError
from routes import auth_bp
from models import db, User
from schemas import LoginSchema, SignupSchema
import time
from collections import defaultdict

rate_limit_store = defaultdict(list)
RATE_LIMIT_MAX = 60
RATE_LIMIT_WINDOW = 60

def rate_limit(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        client_ip = request.remote_addr
        now = time.time()
        window_start = now - RATE_LIMIT_WINDOW
        rate_limit_store[client_ip] = [
            t for t in rate_limit_store[client_ip] if t > window_start
        ]
        if len(rate_limit_store[client_ip]) >= RATE_LIMIT_MAX:
            return jsonify({"error": "Zbyt wiele żądań. Spróbuj ponownie później."}), 429
        rate_limit_store[client_ip].append(now)
        return f(*args, **kwargs)
    return decorated

def login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({"error": "Nie jesteś zalogowany"}), 401
        return f(*args, **kwargs)
    return decorated_function

@auth_bp.route('/signup', methods=['POST'])
@rate_limit
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

    is_first_user = User.query.first() is None
    user = User(
        username=username,
        email=email,
        role='admin' if is_first_user else 'user'
    )
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    session['user_id'] = user.id
    return jsonify({"message": "Rejestracja pomyślna", "user": user.to_dict()}), 201

@auth_bp.route('/login', methods=['POST'])
@rate_limit
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

    session['user_id'] = user.id
    session.permanent = True
    return jsonify({"message": "Logowanie pomyślne", "user": user.to_dict()})

@auth_bp.route('/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    return jsonify({"message": "Wylogowano"})

@auth_bp.route('/me', methods=['GET'])
@login_required
def get_current_user():
    user_id = session.get('user_id')
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "Użytkownik nie znaleziony"}), 404
    return jsonify(user.to_dict())
