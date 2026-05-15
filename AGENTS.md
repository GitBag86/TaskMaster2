# Task Management API - Agent Instructions

A Flask-based REST API for task management with role-based access control, subtasks, comments, and filtering. Now with Docker support, PWA features, and real-time UI components.

## Quick Start

### Option 1: Docker (Recommended)
```bash
docker-compose up --build
```
Runs on `http://localhost:5000`. Database is persisted in `instance/`.

### Option 2: Local Setup
```bash
# Install dependencies
pip install -r requirements.txt

# Initialize database migrations (if first run)
flask db upgrade

# Run development server
python app.py  # Runs on http://localhost:5000
```

**Database:** SQLite (`instance/tasks.db`) - managed via Flask-Migrate.

## Architecture

### Core Models

- **User** - Authentication with roles (`admin` / `user`). First user becomes admin.
- **Task** - Main entity with title, priority, project, due_date, notes. Owner has relationship to User. Supports many-to-many relationships (tags, dependencies) and one-to-many (comments, subtasks, custom_fields).
- **Other Models** - Tag, SavedFilter, ActivityLog, RecurringTask, TaskTemplate, TaskDependency, CustomField.

### Database Migrations
We use **Flask-Migrate** (Alembic). 
- **DO NOT** delete `instance/tasks.db` to change schema.
- **DO** use: `flask db migrate -m "description"` followed by `flask db upgrade`.

### Auth & Permissions

- **Session-based** - `user_id` stored in Flask session. Decorated with `@login_required`.
- **Role-based** - Admins can manage all tasks; regular users see only tasks assigned to them.

### API Pattern

All responses are JSON. Error responses follow: `{"error": "message"}` with appropriate HTTP status (401, 403, 404).

## Key Files

- **app.py** - Flask app, models, decorators, all routes (~800+ lines)
- **schemas.py** - Marshmallow schemas for validation
- **index.html** - Vanilla JS SPA with Kanban, Dashboard, Calendar, and PWA support
- **Dockerfile / docker-compose.yml** - Containerization setup
- **sw.js / manifest.json** - PWA configuration

## Frontend Patterns
- **Toast Notifications**: Use `showToast(message, type)` for feedback.
- **Kanban Board**: Integrated into the secondary tab for status management.
- **Real-Time Updates**: Uses Socket.io. Notifications for task actions (create, delete, etc.) are broadcasted to all users.

## Common Pitfalls

- **Marshmallow v3.x compatibility** - Use `load_default` instead of `default` for field defaults in schemas.
- **Decorator stacking** - `@app.route()` must come BEFORE `@login_required` in the decorator stack.
- **WebSocket workers** - When running with Gunicorn in Docker, use the `gthread` worker class instead of `eventlet` for better compatibility.

## Agent Skills & Guidelines
- [Frontend Responsive Check](.vscode/prompts/frontend-responsive-check.prompt.md) - Enforces UI standards.
- [Backend Test Generator](.vscode/prompts/backend-test-generator.prompt.md) - Scaffolds pytest suites.
- [SocketIO Patterns](.vscode/prompts/socketio-patterns.prompt.md) - Real-time feature conventions.
- [Post-Migration Check](.vscode/prompts/post-migration-check.prompt.md) - Schema consistency verification.

## Testing & Debugging

- App runs with `debug=True` on port 5000 by default
- Use `pytest` for automated testing (backend).
- Check logs via `logger.info()` statements.

## Docker Optimization Guide for AI Agents

When working with Docker containers for this application, AI agents should be aware of:

1. **Worker Class Compatibility**: The current Dockerfile uses `eventlet` worker class which has known compatibility issues. For production, use `gthread` workers.

2. **Image Size Optimization**: 
   - Use multi-stage builds to reduce final image size
   - Clean up package caches in Dockerfile
   - Use slim base images

3. **Health Checks**: Add health check endpoints to ensure container reliability

4. **Environment Configuration**: Properly manage environment variables and secrets

5. **Build Context**: Be mindful of what gets copied into the build context

## Agent Workflow Recommendations

1. **Container Build**: When building Docker images, prefer `gthread` worker class for production
2. **Image Size**: Use `.dockerignore` to exclude unnecessary files
3. **Build Context**: Limit files copied during build to improve speed
4. **Environment Variables**: Manage configuration properly with `.env` files
5. **Health Monitoring**: Implement health check endpoints for production readiness
