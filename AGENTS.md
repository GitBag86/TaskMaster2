# Task Management API - Agent Instructions

A Flask-based REST API for task management with role-based access control, subtasks, comments, and filtering.

## Quick Start

### Setup & Run

```bash
# Install dependencies
pip install -r requirements.txt

# Set environment (optional, has defaults)
export SECRET_KEY="your-secret-key"

# Run development server
python app.py  # Runs on http://localhost:5000
```

**Database:** SQLite (`instance/tasks.db`) - auto-created on first run.

## Architecture

### Core Models

- **User** - Authentication with roles (`admin` / `user`). First user becomes admin.
- **Task** - Main entity with title, priority, project, due_date, notes. Owner has relationship to User. Supports many-to-many relationships (tags, dependencies) and one-to-many (comments, subtasks, custom_fields).
- **Other Models** - Tag, SavedFilter, ActivityLog, RecurringTask, TaskTemplate, TaskDependency, CustomField.
- **Comment** - Text comments attached to tasks (anonymous by default).
- **Subtask** - Child tasks under a parent Task for breakdown.

### Auth & Permissions

- **Session-based** - `user_id` stored in Flask session. Decorated with `@login_required`.
- **Role-based** - Admins can manage all tasks; regular users see only tasks assigned to them.
- **Decorator pattern** - Use `@login_required` and `@validate_user_role()` for protected routes.

### API Pattern

All responses are JSON. Error responses follow: `{"error": "message"}` with appropriate HTTP status (401, 403, 404).

**Serialization:** Models have `to_dict()` methods for JSON output.

**Validation:** Marshmallow schemas in `schemas.py` validate request payloads.

## Key Files

- **app.py** - Flask app, models, decorators, all routes (~800+ lines)
- **schemas.py** - Marshmallow schemas for validation
- **requirements.txt** - Dependencies (Flask, SQLAlchemy, CORS, etc.)
- **index.html** - Comprehensive Vanilla JS frontend (SPA) with responsive design, Chart.js integration, calendar, and modal dialogs
- **instance/tasks.db** - SQLite database (auto-created)

## Common Tasks

### Adding a New Route

1. Define a route function with `@app.route('/path', methods=['POST'])`
2. Add `@login_required` if auth needed; use `@validate_user_role()` for admin-only endpoints
3. Fetch `user_id = session.get('user_id')` and query User
4. Query models via SQLAlchemy: `Task.query.get(id)` or `Task.query.filter_by(assigned_to=...)`
5. Return JSON: `jsonify({"key": value})` with 201 for create, 200 for success, 4xx for errors

### Modifying the Database Schema

1. Update the model class in app.py (e.g., add `db.Column()` to Task)
2. Delete `instance/tasks.db` to reset, or use a migration tool (not currently in use)
3. Restart the app; `db.create_all()` runs on startup

### Adding Validation

1. Create or update a schema in `schemas.py` using Marshmallow field validators
2. Import in app.py: `from schemas import YourSchema`
3. Use in route: `schema = YourSchema(); errors = schema.validate(data)` if needed

## Common Pitfalls

- **Permission checks missing** - Remember to check `user.role` before admin operations (create, update, delete tasks).
- **Decorator stacking** - `@app.route()` must come BEFORE `@login_required` in the decorator stack.
- **Auto-admin assignment** - First user signup auto-assigns `role='admin'` — watch this in tests.
- **Session management** - Session needs Flask session secret key; `.env` is not committed; use environment variables.
- **Marshmallow v3.x compatibility** - Use `load_default` instead of `default` for field defaults in schemas.

## Standards in Codebase

- **Naming:** Snake case for variables/functions, CamelCase for classes
- **Imports:** Group by Flask, extensions, models, schemas, utilities
- **Error handling:** Return error dict + status code, no exceptions raised to client
- **Logging:** Uses `logger.info()` for route entry/exit and request logging
- **CORS:** Enabled with `supports_credentials=True` for frontend integration
- **Date handling:** Uses `datetime.utcnow()` and ISO 8601 format for JSON serialization

## Testing & Debugging

- App runs with `debug=True` on port 5000 by default
- Check logs via `logger.info()` statements or Flask's default logging
- Use cookies.txt (in repo) if testing with curl authentication
- No test suite currently; consider adding pytest with fixtures for models

## Common Agent Tasks

- **Add new task attributes** - Add db.Column to Task model, update TaskSchema, return in to_dict()
- **Create admin-only endpoint** - Use `@validate_user_role(['admin'])` decorator
- **Implement filtering** - Add query filters like `/tasks/filter?priority=high&completed=false`
- **Fix auth bugs** - Check session management, decorator order, and role checks
- **Improve validation** - Extend Marshmallow schemas with custom validators and error messages
