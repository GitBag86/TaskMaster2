# Task Management API - Agent Instructions

**TaskMaster2**: A full-stack task management application with a Flask REST API backend and React/TypeScript SPA frontend. Features role-based access control, subtasks, comments, real-time updates via Socket.IO, dark mode, and PWA support.

---

## � Quick Navigation

**For AI Agents:**
- 🎯 **[Quick Decision Tree](#quick-decision-tree)** ← Start here to pick your task type
- 🔧 **[Critical Rules](#critical-rules--do-not-skip)** ← Non-negotiable patterns (Socket.IO, Marshmallow, etc.)
- 📂 **[Key Files & Patterns](#key-files--exemplary-patterns)** ← See best practices in real code
- ⚠️ **[Common Pitfalls](#common-pitfalls)** ← Avoid known issues
- 📚 **[Instruction Files](#related-instruction-files)** ← Domain-specific guidelines

---

## 🎯 Quick Decision Tree

**What are you implementing or fixing?**

| Task Type | First Steps | See Also |
|-----------|------------|----------|
| **New REST endpoint** | 1. Create route in `routes/` <br> 2. Add Marshmallow schema <br> 3. If POST/PATCH/DELETE: emit `task_action` <br> 4. Add pytest tests | [Socket.IO Patterns](#socket-io-real-time-sync), [Exemplary: routes/tasks.py](#key-files--exemplary-patterns) |
| **Database schema change** | 1. Update `models.py` <br> 2. `flask db migrate -m "desc"` <br> 3. `flask db upgrade` <br> 4. Add tests | [Resolved Issues: Migrations](#resolved-issues-for-agent-awareness) |
| **New frontend page/component** | 1. Create in `frontend/src/components/` <br> 2. Lazy-load in `App.tsx` <br> 3. Use `useAuth()`, `useSocket()`, `useTheme()` hooks <br> 4. Style with Tailwind | [Frontend Guidelines](#related-instruction-files), [Exemplary: DashboardLayout.tsx](#key-files--exemplary-patterns) |
| **Real-time sync issue** | 1. Check: Backend emits `socketio.emit()` after DB commit <br> 2. Verify: Frontend listens in `SocketContext.tsx` <br> 3. Check browser console for Socket.IO events | [Socket.IO Patterns](#socket-io-real-time-sync), [Pitfall: Missing Socket.IO Emit](#common-pitfalls) |
| **Bug or performance issue** | 1. Review [Common Pitfalls](#common-pitfalls) <br> 2. Check [Resolved Issues](#resolved-issues-for-agent-awareness) <br> 3. Check instruction files for domain-specific rules | [Pitfalls Table](#common-pitfalls) |

---

## �🚀 Quick Start

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
- Complete deployment workflow

**Troubleshooting Database Issues:**
If deployment fails with database errors, see [CLOUD_RUN_TROUBLESHOOTING.md](CLOUD_RUN_TROUBLESHOOTING.md) for:
- Socket connection errors
- User/database not found
- Migration failures
- IAM permission issues
- Connection timeouts
- Debugging checklist

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

### Task Dependencies
Tasks can depend on other tasks via the `TaskDependency` model. When implementing dependency-related features:

```python
# Get all tasks this task depends on
dependencies = TaskDependency.query.filter_by(task_id=1).all()

# Check if a task can be deleted (has dependents)
dependents = TaskDependency.query.filter_by(depends_on_id=1).all()
if dependents:
    return {"error": "Cannot delete task with dependent tasks"}, 409

# Add a dependency
dep = TaskDependency(task_id=1, depends_on_id=2)
db.session.add(dep)
db.session.commit()

# Emit dependency change via Socket.IO
socketio.emit('task_action', {
    'action': 'dependency_added',
    'task_id': 1,
    'depends_on_id': 2
}, broadcast=True)
```

**Important**: Tasks with dependencies use CASCADE delete. Deleting a task automatically deletes its dependency records. Test carefully when implementing delete endpoints.

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
FLASK_ENV=development              # development or production
SECRET_KEY=your-secret             # Session encryption (auto-generated in dev)
DATABASE_URL=...                   # Override SQLite location (optional)
CORS_ORIGINS=http://localhost:5000 # Allow cross-origin in dev
LOG_LEVEL=INFO                     # Logging verbosity
SOCKETIO_ASYNC_MODE=threading      # threading (dev) or gthread (Docker)
SOCKETIO_MESSAGE_QUEUE=...         # Redis URL for multi-worker deployments (optional)
```

**Socket.IO Async Mode:**
- `threading` — Local development (default, Flask debug server)
- `gthread` — Docker/Gunicorn production (worker-class: gthread)
- ❌ **Avoid `eventlet`** — Deprecated, known compatibility issues

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

## Related Instruction Files

When modifying this codebase, agents should follow these domain-specific guidelines:

| File | Purpose | Apply To |
|------|---------|----------|
| [Socket.IO Patterns](.github/instructions/socketio-patterns.instructions.md) | Real-time sync emission and listener patterns | `routes/**/*.py`, `frontend/src/store/SocketContext.tsx` |
| [Frontend TypeScript Guidelines](.github/instructions/frontend-typescript-guidelines.instructions.md) | React, TypeScript, Context API, Tailwind best practices | `frontend/src/**/*.tsx`, `frontend/src/**/*.ts` |
| [Python Security Guidelines](.github/instructions/python-security-guidelines.instructions.md) | Secure credential & secret handling | `**/*.py` |
| [Python Test Guidelines](.github/instructions/python-test-guidelines.instructions.md) | TDD requirement: automated tests for all Python changes | `**/*.py` |
| [Python Conventions Skill](.github/skills/python-conventions/SKILL.md) | Code style and pragmatic conventions | `**/*.py` |

## Available Agent Skills
- [Socket.IO Patterns](.vscode/prompts/socketio-patterns.prompt.md) - Real-time sync implementation guide for Flask + Socket.IO.
- [Frontend Responsive Check](.vscode/prompts/frontend-responsive-check.prompt.md) - Validates responsive design and prevents UI overflow.
- [Post-Migration Check](.vscode/prompts/post-migration-check.prompt.md) - Ensures schema integrity after `flask db upgrade`.
- [Backend Test Generator](.vscode/prompts/backend-test-generator.prompt.md) - Scaffolds pytest suites for new endpoints.

## Deployment Guides

- [Cloud Run Quickstart](CLOUD_RUN_QUICKSTART.md) - **Copy-paste commands for step-by-step deployment** ← Start here!
- [Cloud Run Setup Guide](CLOUD_RUN_SETUP.md) - Complete Google Cloud Run + Cloud SQL deployment
- [Cloud Run Troubleshooting](CLOUD_RUN_TROUBLESHOOTING.md) - **Fixes for common database errors** ← Start here if deployment fails
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
## Health Checks (For Production Readiness)

Add health check endpoints for monitoring and load balancers:

```python
# app.py
@app.route('/health', methods=['GET'])
def health_check():
    """Simple health check endpoint."""
    try:
        # Verify database connection
        db.session.execute('SELECT 1')
        return jsonify({'status': 'healthy', 'timestamp': datetime.utcnow().isoformat()}), 200
    except Exception as e:
        return jsonify({'status': 'unhealthy', 'error': str(e)}), 503

@app.route('/ready', methods=['GET'])
def readiness_check():
    """Readiness check for Kubernetes/Cloud Run."""
    try:
        # Check: Database connected
        db.session.execute('SELECT COUNT(*) FROM user')
        # Check: Socket.IO initialized
        assert socketio is not None
        return jsonify({'status': 'ready'}), 200
    except Exception as e:
        return jsonify({'status': 'not_ready', 'error': str(e)}), 503
```

**Cloud Run Configuration:**
```yaml
# In container health checks
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
```

### Development Troubleshooting

**Port 5000 already in use:**
```bash
# Find process using port 5000
lsof -i :5000          # macOS/Linux
netstat -ano | findstr :5000  # Windows

# Kill process
kill -9 <PID>          # macOS/Linux
taskkill /PID <PID> /F # Windows

# Or use different port
FLASK_RUN_PORT=5001 python app.py
```

**Flask dev server not reloading:**
```bash
# Ensure FLASK_ENV is set
export FLASK_ENV=development

# Files must be in watched directories (not ignored by .gitignore)
# Common issue: editing files in venv/ or node_modules/
```

**Socket.IO connection timeout:**
```bash
# 1. Verify Flask is running
lsof -i :5000

# 2. Check CORS is configured in app.py
print(app.config.get('CORS_ORIGINS'))

# 3. Frontend console (F12): check socket URL
console.log(socket.io.uri)  # Should be http://localhost:5000

# 4. Restart both frontend and backend
```

**npm install cache issues:**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

**Python venv not activated:**
```bash
# Check if activated (should show (venv) in prompt)
source .venv/bin/activate        # macOS/Linux
.venv\Scripts\activate.bat       # Windows (cmd)
.venv\Scripts\Activate.ps1       # Windows (PowerShell)
```


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
