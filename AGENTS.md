# Task Management API - Agent Instructions

**TaskMaster2**: A full-stack task management application with a Flask REST API backend and React/TypeScript SPA frontend. Features role-based access control, subtasks, comments, real-time updates via Socket.IO, dark mode, and PWA support.

---

## 🚀 Quick Start

### Option 1: Docker (Recommended)
```bash
docker-compose up --build
```
Runs on `http://localhost:5000`. Database is persisted in `instance/`.

### Option 2: Local Development (Full-Stack)

**Backend:**
```bash
# Set up Python environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Apply database migrations
flask db upgrade

# Run Flask dev server (port 5000)
python app.py
```

**Frontend (separate terminal):**
```bash
cd frontend
npm install                 # First time only
npm run dev                 # Runs Vite dev server on port 3000
```

The frontend dev server proxies API calls (`/auth`, `/tasks`, etc.) to the Flask backend on `localhost:5000`.

### Database & Testing
```bash
# Apply migrations after schema changes
flask db migrate -m "description"
flask db upgrade

# Run tests
pytest
```

**Database:** SQLite (`instance/tasks.db`) - managed via Flask-Migrate.

---

## 🚀 Deployment

### Google Cloud Run + Cloud SQL (Postgres)

TaskMaster2 is optimized for Google Cloud Run with managed Postgres via Cloud SQL.

**Quick Deploy (Recommended):**
```bash
# 1. Run automated deployment script
chmod +x deploy-cloud-run.sh
./deploy-cloud-run.sh your-project-id us-central1 taskmaster

# The script will:
# - Build and push Docker image
# - Deploy to Cloud Run
# - Set up database connection
# - Run migrations
```

**Manual Deploy:**
See [CLOUD_RUN_SETUP.md](CLOUD_RUN_SETUP.md) for detailed step-by-step instructions including:
- Cloud SQL instance setup
- Docker image configuration
- Environment variables
- Troubleshooting common issues

**Local Postgres Testing:**
Before deploying to Cloud Run, test locally with Postgres. See [POSTGRES_MIGRATION.md](POSTGRES_MIGRATION.md) for:
- Starting Postgres with Docker
- Running migrations
- Testing the app with Postgres
- Migrating data from SQLite (if needed)

**Why Cloud Run?**
- Scales to zero (pay only when serving requests)
- Automatic HTTPS, load balancing
- Managed Postgres (Cloud SQL) - no infrastructure to maintain
- Integrates with Google Cloud ecosystem

---

## 🏗️ Architecture

### Technology Stack
- **Backend**: Flask 3.x + SQLAlchemy ORM + Marshmallow (validation/serialization)
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Database**: SQLite with Flask-Migrate (Alembic)
- **Real-Time**: Socket.IO for cross-client synchronization
- **Auth**: Session-based (user_id in Flask session)
- **Deployment**: Docker + Gunicorn (gthread worker class)

### Backend Architecture

**Core Models** (`models.py`)
- **User** - Authentication; roles (`admin` / `user`); first user auto-becomes admin
- **Task** - Main entity with title, priority, project, due_date, notes, owner
  - Many-to-many: assignees, tags, dependencies
  - One-to-many: comments, subtasks, custom_fields, activity logs
- **Supporting**: Subtask, Comment, Tag, SavedFilter, ActivityLog, RecurringTask, TaskTemplate, TaskDependency, CustomField

**Modules** (`routes/`)
- `auth.py` - Login, signup, user management (rate-limited)
- `tasks.py` - CRUD operations with real-time Socket.IO emission
- `filters.py` - Saved filters and custom views
- `stats.py` - Dashboard statistics
- `users.py` - User management and admin operations

**API Patterns**
- All endpoints return JSON
- Success: Task object or list with HTTP 200/201
- Errors: `{"error": "message"}` with HTTP 401/403/404/429
- Request validation via Marshmallow schemas (`schemas.py`)
- Session-based auth: `@login_required` decorator
- Rate limiting: 60 requests/min per IP on auth endpoints

**Real-Time Synchronization** (Socket.IO)
- Backend: `socketio.emit('task_action', {'action': 'create', 'task_id': id})` after mutations
- Frontend: Listens for `task_action`, triggers `loadTasks()` + toast notifications
- **Critical**: Any POST/PATCH/DELETE must emit `task_action` to keep all clients in sync

### Frontend Architecture

**Directory Structure** (`frontend/src/`)
```
components/
  ├─ Activity/ActivityPage.tsx
  ├─ Admin/AdminPage.tsx
  ├─ Auth/AuthPage.tsx
  ├─ Calendar/CalendarPage.tsx
  ├─ Dashboard/DashboardPage.tsx
  ├─ Kanban/KanbanPage.tsx
  ├─ Layout/DashboardLayout.tsx
  ├─ Tasks/{TasksPage,TaskCard,TaskDetail,TaskForm}.tsx
  └─ common/{Skeletons,Toaster}.tsx
store/
  ├─ AuthContext.tsx    - User auth state & session
  ├─ SocketContext.tsx  - WebSocket connection management
  ├─ ThemeContext.tsx   - Dark/light mode toggle
  └─ ToastContext.tsx   - Toast notifications
api/
  └─ client.ts          - Typed fetch wrapper for API calls
types/
  └─ index.ts           - Shared TypeScript types
```

**State Management** (React Context API, not Redux)
- `AuthContext` - Authentication, session validation, logout
- `SocketContext` - Socket.IO connection, connection state
- `ThemeContext` - Dark mode (Tailwind `darkMode: 'class'`)
- `ToastContext` - Toast notifications with `showToast(message, type)`

**Component Patterns**
- Route components lazy-loaded via `React.lazy()` + `Suspense`
- Fallback loading via `<Skeletons/>` component
- API calls centralized in `api/client.ts` (typed fetch wrapper)
- Error handling: HTTP errors caught and displayed via toasts
- Responsive: Tailwind breakpoints; mobile-first design

**Styling** (Tailwind CSS)
- Dark mode enabled via `darkMode: 'class'` in `tailwind.config.ts`
- Custom turquoise-purple theme in `frontend/src/index.css`
- Dark mode toggle button in `DashboardLayout.tsx`
- Utility-first approach; no custom component CSS

### Database Migrations
Use **Flask-Migrate** (Alembic):
- **DO NOT** delete `instance/tasks.db` directly to change schema
- **DO** use:
  ```bash
  flask db migrate -m "description"  # Auto-detect model changes
  flask db upgrade                   # Apply migrations
  ```
- Review generated migration files in `migrations/versions/`
- Roll back if needed: `flask db downgrade`

### Database & Permissions

- **Session-based Auth**: `user_id` stored in Flask session via `@login_required`
- **Role-based Access**: Admins manage all tasks; regular users see only assigned tasks
- **Ownership**: Task owner is the user who created it; can be reassigned

## Key Files & Exemplary Patterns

| File | Pattern | Why It Matters |
|------|---------|---|
| [app.py](app.py) | Flask app + models + routes (800+ lines) | Entry point; contains main route handlers and Socket.IO setup |
| [models.py](models.py) | SQLAlchemy models with relationships | Schema definition; shows cascade deletes, many-to-many tables |
| [schemas.py](schemas.py) | Marshmallow v3.x validation | Request validation; shows `load_default` (not `default`) pattern |
| [routes/auth.py](routes/auth.py) | Auth + rate limiting + session | Shows input validation, error handling, custom decorators |
| [routes/tasks.py](routes/tasks.py) | Task CRUD + Socket.IO emission + pagination | Demonstrates real-time sync pattern: emit after mutations |
| [frontend/src/App.tsx](frontend/src/App.tsx) | Route protection + Suspense + Context | Shows auth guard, lazy loading, provider nesting |
| [frontend/src/store/AuthContext.tsx](frontend/src/store/AuthContext.tsx) | Context API + custom hook | Centralized auth state; clean hook interface |
| [frontend/src/api/client.ts](frontend/src/api/client.ts) | Typed fetch wrapper | DRY API calls; centralized error handling; type safety |
| [frontend/src/components/Dashboard/DashboardLayout.tsx](frontend/src/components/Dashboard/DashboardLayout.tsx) | Dark mode toggle + layout | Shows Tailwind dark mode class-based strategy |
| [frontend/src/index.css](frontend/src/index.css) | Tailwind + custom theme | Dark mode colors (turquoise-purple); CSS variables |
| [Dockerfile](Dockerfile) + [docker-compose.yml](docker-compose.yml) | Multi-stage build + volumes | Production setup; shows proper Flask + Node.js staging |

## Frontend Setup & Build

**Initial Setup:**
```bash
cd frontend
npm install
```

**Development:**
```bash
npm run dev        # Vite dev server on port 3000 (proxies to Flask :5000)
npm run build      # Build React SPA to frontend/dist/
npm run preview    # Preview production build locally
```

**Important**: Flask serves the built frontend from `frontend/dist/`. After frontend changes, run `npm run build` before testing with Python.

## API & Error Handling Patterns

**Request/Response Format**
```json
{
  "id": 1,
  "title": "Task Title",
  "status": "in_progress",
  "priority": "high",
  "assignees": [...],
  "comments": [...],
  "subtasks": [...]
}
```

**Error Responses**
```json
{
  "error": "Task not found",
  "status": 404
}
```

**HTTP Status Codes**
- `200` - Success (GET, PATCH)
- `201` - Created (POST)
- `400` - Bad request (validation error)
- `401` - Unauthorized (not logged in)
- `403` - Forbidden (permission denied)
- `404` - Not found
- `429` - Rate limit exceeded (auth endpoints)

**Validation**: Marshmallow schemas in `schemas.py` automatically validate incoming JSON.

## Environment Variables

Key `.env` variables (optional; defaults provided):
```
FLASK_ENV=development      # development or production
SECRET_KEY=your-secret     # Session encryption (auto-generated in dev)
DATABASE_URL=...           # Override SQLite location (optional)
CORS_ORIGINS=http://localhost:5000   # Allow cross-origin in dev
LOG_LEVEL=INFO             # Logging verbosity
```

In Docker, these are set in `docker-compose.yml`.

## Resolved Issues (for Agent Awareness)
- **Incorrect Static Folder**: Flask `static_folder` was pointing to `.` instead of `frontend/dist`. Fixed in `app.py`.
- **Missing Frontend Build**: The React frontend needed to be built (`cd frontend && npm run build`).
- **Broken .gitignore**: Initial `.gitignore` ignored all files (`*`). Corrected to properly ignore virtual environments, `node_modules`, `instance/tasks.db`, and build artifacts.
- **Git Rebase Conflicts**: Resolved conflicts related to binary files during rebase operations.
- **Dark Mode Not Working**: Tailwind CSS `darkMode: 'class'` was not enabled, and color variables were not properly configured for a distinct dark mode theme. Fixed in `tailwind.config.ts` and `frontend/src/index.css` with a turquoise-purple scheme.

## Common Pitfalls

- **Marshmallow v3.x compatibility** - Use `load_default` instead of `default` for field defaults in schemas.
- **Decorator stacking** - `@app.route()` must come BEFORE `@login_required` in the decorator stack.
- **WebSocket workers** - When running with Gunicorn in Docker, use the `gthread` worker class. For local development, `threading` is now the preferred `async_mode` for SocketIO to avoid `eventlet` deprecation issues.
- **Port Conflicts**: Port 5000 is the default. If busy, check for ghost processes or browser tabs.
- **Frontend not built**: Flask serves `frontend/dist/`. If you update frontend code but don't run `npm run build`, changes won't appear. Always rebuild after frontend edits.
- **Rate Limiting**: Auth endpoints (signup/login) are rate-limited to 60 requests/min per IP. In rapid testing, use different IPs or wait for rate limit to reset.
- **Socket.IO Emission**: Any POST/PATCH/DELETE that modifies task state MUST be followed by `socketio.emit('task_action', ...)`. Without it, other clients won't see updates.
- **Session Timeout**: Session-based auth means users are logged in as long as the session exists. Test logout thoroughly.
- **Large Files**: `app.py` and `frontend/index.html` are 800+ lines. When editing, use specific `replace_string_in_file` calls with 3+ lines of context to avoid ambiguous matches.
- **Cascade Deletes**: Models use `cascade='all, delete-orphan'`. Deleting a parent (e.g., Task) automatically deletes children (e.g., Subtasks, Comments). Be careful with migrations affecting parent-child relationships.

## Cloud Run + Postgres Troubleshooting

### Connection Issues

**Error: "Cannot connect to Postgres"**
```bash
# 1. Verify Cloud SQL instance is running
gcloud sql instances describe taskmaster

# 2. Check Cloud Run service account has Cloud SQL Client role
gcloud projects get-iam-policy YOUR_PROJECT \
  --flatten="bindings[].members" \
  --filter="bindings.role:cloudsql.client"

# 3. View Cloud Run logs
gcloud run logs read taskmaster2 --region us-central1 --limit 50
```

**Error: "host /cloudsql/... does not exist"**
- Cloud SQL Auth Proxy not running or misconfigured
- Verify `INSTANCE_UNIX_SOCKET` env var matches actual connection name
- Check: `gcloud sql instances describe taskmaster --format='value(connectionName)'`

**Error: "authentication failed for user 'appuser'"**
```bash
# Verify password is correct (regenerate if needed)
gcloud sql users set-password appuser \
  --instance=taskmaster \
  --password=NEW_PASSWORD

# Update Cloud Run env var
gcloud run services update taskmaster2 \
  --set-env-vars DB_PASSWORD=NEW_PASSWORD
```

### Migration Issues

**Error: "relation 'user' does not exist"**
- Migrations didn't run after first deployment
- Run migration job:
```bash
gcloud beta run jobs execute taskmaster2-migrate --region us-central1
```

**Error: "permission denied for schema public"**
- Database user doesn't have proper permissions
- Grant permissions (requires psql access):
```bash
psql postgresql://appuser:password@cloud-sql-host/taskmaster_db
# In psql:
GRANT ALL PRIVILEGES ON SCHEMA public TO appuser;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO appuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO appuser;
```

### Performance Issues

**Slow queries from Cloud Run**
- Enable connection pooling: Consider PgBouncer
- Check Cloud SQL instance size (might need higher tier)
- View metrics: `gcloud sql instances describe taskmaster --format=pretty`

**Cold starts (first request takes 30+ seconds)**
- Normal on Cloud Run (container startup + DB connection)
- Mitigation: Set `--min-instances 1` to keep container warm
```bash
gcloud run services update taskmaster2 --min-instances 1 --region us-central1
```

### Scaling Issues

**Error: "too many connections"**
- Cloud SQL instance has connection limit (default: 100)
- Reduce Cloud Run `--concurrency` or increase Cloud SQL connections:
```bash
# Check current connections
gcloud sql instances describe taskmaster --format='value(settings.ipConfiguration.maxConnections)'

# Increase limit (requires instance stop on some versions)
gcloud sql instances patch taskmaster --database-flags max_connections=200
```

**Error: "Disk quota exceeded"**
- Cloud SQL instance ran out of storage
- Resize: `gcloud sql instances patch taskmaster --storage-size=20GB`

## Agent Skills & Guidelines
- [Frontend Responsive Check](.vscode/prompts/frontend-responsive-check.prompt.md) - Enforces UI standards.
- [Backend Test Generator](.vscode/prompts/backend-test-generator.prompt.md) - Scaffolds pytest suites.
- [SocketIO Patterns](.vscode/prompts/socketio-patterns.prompt.md) - Real-time feature conventions.
- [Post-Migration Check](.vscode/prompts/post-migration-check.prompt.md) - Schema consistency verification.
- [Python Conventions Skill](SKILL.md) - Pragmatic Python conventions for readability and maintainability
- [Python Security Guidelines](.github/instructions/python-security-guidelines.instructions.md) - Secure credential handling
- [Python Test Guidelines](.github/instructions/python-test-guidelines.instructions.md) - TDD requirement: every Python change needs automated tests

## Deployment Guides

- [Cloud Run Setup Guide](CLOUD_RUN_SETUP.md) - Complete Google Cloud Run + Cloud SQL deployment
- [Postgres Migration Guide](POSTGRES_MIGRATION.md) - SQLite → Postgres migration for testing locally
- [Deploy Script](deploy-cloud-run.sh) - Automated Cloud Run deployment (run with `./deploy-cloud-run.sh PROJECT_ID REGION`)

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

## Refactoring & Code Quality

- **Large Files**: `app.py` and `index.html` are significantly large. When modifying, use specific `replace_string_in_file` calls with sufficient context to avoid ambiguous matches.
- **Modularity**: New features should consider being broken out into separate modules (e.g., `routes/`, `models/`, `static/js/components/`) if they grow beyond a few functions.
- **Real-time consistency**: Any state-changing operation (Create/Update/Delete) MUST be followed by a `socketio.emit('task_action', ...)` to keep all clients in sync.
- **Frontend State**: The frontend reloads the entire task list (`loadTasks()`) on any remote change. For performance with many tasks, consider partial state updates in the future.