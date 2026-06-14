# TaskMaster2 v1.0 — Agent Instructions

**TaskMaster2**: A full-stack task management application with a Flask REST API backend and React/TypeScript SPA frontend. Features role-based access control, subtasks, comments, real-time updates via Socket.IO, dark mode, and PWA support.

Deployment target: **Railway** (Docker build via `Dockerfile`, edge proxy + SSL provided by Railway). Database: **PostgreSQL** in production (Railway managed), **SQLite** for local dev.

---

## 📍 Quick Navigation

- 🎯 **[Quick Decision Tree](#quick-decision-tree)** ← Start here to pick your task type
- 🔧 **[Critical Rules](#critical-rules--do-not-skip)** ← Non-negotiable patterns (Socket.IO, Marshmallow, etc.)
- 📂 **[Key Files & Patterns](#key-files--exemplary-patterns)** ← See best practices in real code
- ⚠️ **[Common Pitfalls](#common-pitfalls)** ← Avoid known issues
- 📚 **[Instruction Files](#related-instruction-files)** ← Domain-specific guidelines

---

## 🎯 Quick Decision Tree

**What are you implementing or fixing?**

| Task Type                       | First Steps                                                                                                                                                                                                                                                                                                                                                                                                  | See Also                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New REST endpoint**           | 1. Create route in `routes/` <br> 2. Pick decorator: `@require_team_member` (default), `@require_super_admin`, `@require_role(...)` <br> 3. Use `team_scoped(Model.query, Model)` for lists, `get_team_resource_or_404(Model, id)` for single resource <br> 4. Add Marshmallow schema <br> 5. If POST/PATCH/DELETE: `socketio.emit('task_action', payload, room=f'team:{team_id}')` <br> 6. Add pytest tests | [Authorization Layer](#authorization-layer-team-workspaces), [Socket.IO Patterns](#socket-io-real-time-sync), [Exemplary: routes/tasks.py](#key-files--exemplary-patterns) |
| **Database schema change**      | 1. Update `models.py` (add `team_id` if team-scoped) <br> 2. `flask db migrate -m "desc"` <br> 3. Edit migration manually if data backfill needed <br> 4. `flask db upgrade` <br> 5. Add tests                                                                                                                                                                                                               | [Common Pitfalls](#common-pitfalls)                                                                                                                                        |
| **New frontend page/component** | 1. Create in `frontend/src/components/` <br> 2. Lazy-load in `App.tsx` (wrap in `<RoleRoute roles={[...]}>` if role-restricted) <br> 3. Use `useAuth()`, `useSocket()`, `useTheme()` hooks <br> 4. Style with Tailwind                                                                                                                                                                                       | [Frontend Guidelines](#related-instruction-files), [Exemplary: DashboardLayout.tsx](#key-files--exemplary-patterns)                                                        |
| **Real-time sync issue**        | 1. Check: Backend emits `socketio.emit()` with `room=f'team:{team_id}'` after DB commit <br> 2. Verify: Frontend listens in `SocketContext.tsx` <br> 3. Check browser console for Socket.IO events                                                                                                                                                                                                           | [Socket.IO Patterns](#socket-io-real-time-sync), [Pitfall: Missing Socket.IO Emit](#common-pitfalls)                                                                       |
| **Bug or performance issue**    | 1. Review [Common Pitfalls](#common-pitfalls) <br> 2. For list endpoints: ensure `_eager_task_options()` is used <br> 3. Check instruction files for domain-specific rules                                                                                                                                                                                                                                   | [Pitfalls Table](#common-pitfalls), [Authorization Layer](#authorization-layer-team-workspaces)                                                                            |

---

## 🚀 Quick Start

### Lokalny development

**Backend:**

```bash
python3 -m venv .venv
source .venv/bin/activate           # Windows: .venv\Scripts\activate
pip install -r requirements.txt
flask db upgrade
python app.py                       # Flask dev server na :5000
```

**Frontend (osobny terminal):**

```bash
cd frontend
npm install
npm run dev                         # Vite na :3000, proxy do Flask :5000
```

### Lokalny build w Dockerze

```bash
docker build -t taskmaster2 .
docker run -p 5000:5000 --env-file .env taskmaster2
```

### Database & Testing

```bash
flask db migrate -m "description"
flask db upgrade
pytest
```

---

## 🚀 Deployment (Railway)

Aplikacja deployuje sie automatycznie przez Railway: push na `main` -> Railway buduje obraz z `Dockerfile` (multi-stage: frontend build + Python runtime) -> uruchamia `start.sh` (Gunicorn gthread, port z `$PORT`).

Co trzeba zrobic raz:

1. New Project -> Deploy from GitHub repo.
2. Variables: ustaw zmienne z `.env.example` (minimum: `SECRET_KEY`, `CORS_ORIGINS`, `PUBLIC_BASE_URL`, dane SMTP jesli chcesz powiadomienia e-mail).
3. Volume na `/app/instance` jesli chcesz persistencji bazy SQLite (Settings -> Storage).

Railway dostarcza HTTPS edge proxy, WebSocket upgrade i wstrzykuje `PORT` (uzywany w `start.sh`). Logi `stdout`/`stderr` sa w panelu projektu.

---

## 🏗️ Architecture

### Technology Stack

- **Backend**: Flask 3.x + SQLAlchemy ORM + Marshmallow (validation/serialization)
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Database**: PostgreSQL (production via Railway managed service) / SQLite (local dev), with Flask-Migrate (Alembic)
- **Real-Time**: Socket.IO for cross-client synchronization
- **Auth**: Session-based (user_id in Flask session)
- **Edge Proxy**: Railway edge (SSL termination, WebSocket upgrade, request routing)
- **Runtime**: Gunicorn (gthread worker class) inside Docker

### Backend Architecture

**Core Models** (`models.py`)

- **User** - Authentication; roles (`admin` / `user`); first user auto-becomes admin
- **Task** - Main entity with title, priority, project, due_date, notes, owner
  - Many-to-many: assignees, tags, dependencies
  - One-to-many: comments, subtasks, custom_fields, activity logs
- **Supporting**: Subtask, Comment, Tag, SavedFilter, ActivityLog, RecurringTask, TaskTemplate, TaskDependency, CustomField, Notification, Project

**Modules** (`routes/`)

- `auth.py` - Login, signup, user management (rate-limited)
- `tasks.py` - CRUD operations with real-time Socket.IO emission
- `filters.py` - Saved filters and custom views
- `stats.py` - Dashboard statistics
- `users.py` - User management and admin operations
- `notifications.py` - User notifications

**API Patterns**

- All endpoints return JSON
- Success: Task object or list with HTTP 200/201
- Errors: `{"error": "message"}` with HTTP 401/403/404/429
- Request validation via Marshmallow schemas (`schemas.py`)
- Session-based auth: `@login_required` decorator
- Rate limiting: not enforced application-side (Railway edge handles basic abuse). For per-route limits dodaj Flask-Limiter.

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
  ├─ Tasks/{TasksPage,TaskCard,TaskDetail,TaskDetailPage,TaskForm}.tsx
  ├─ Settings/SettingsPage.tsx
  └─ common/{Skeletons,Toaster,CommandPalette}.tsx
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

- `AuthContext` - Authentication, session validation, logout, `updateUser()` for profile updates
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

Tasks can depend on other tasks via the `TaskDependency` model. Tasks with open dependencies cannot be marked done. Tasks with cascade-delete behaviour: deleting a task automatically deletes its dependency records, subtasks, comments, and activity logs.

```python
# Get all tasks this task depends on
dependencies = TaskDependency.query.filter_by(task_id=1).all()

# Cycle prevention: enforced in routes/tasks.py via would_create_dependency_cycle()

# Emit dependency change via Socket.IO
socketio.emit('task_action', {'action': 'dependency_added', 'task_id': 1})
```

### Database & Permissions

- **Session-based Auth**: `user_id` stored in Flask session via `@login_required`
- **Role-based Access**: Admins manage all tasks; regular users see only assigned tasks
- **Ownership**: Task owner is the user who created it; can be reassigned

## Key Files & Exemplary Patterns

| File                                                                                                     | Pattern                                     | Why It Matters                                            |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------- |
| [app.py](app.py)                                                                                         | Flask app factory + Socket.IO init          | Entry point; SPA fallback routing, health/ready endpoints |
| [models.py](models.py)                                                                                   | SQLAlchemy models with relationships        | Schema definition; cascade deletes, many-to-many tables   |
| [schemas.py](schemas.py)                                                                                 | Marshmallow v3.x validation                 | Request validation; uses `load_default` (not `default`)   |
| [routes/auth.py](routes/auth.py)                                                                         | Auth + session                              | Input validation, error handling, custom decorators       |
| [routes/tasks.py](routes/tasks.py)                                                                       | Task CRUD + Socket.IO emission + pagination | Real-time sync pattern: emit after mutations              |
| [routes/stats.py](routes/stats.py)                                                                       | DB-side aggregation for dashboard           | Pattern: use `.count()` / `.group_by()` instead of `.all()` + Python loops |
| [frontend/src/App.tsx](frontend/src/App.tsx)                                                             | Route protection + Suspense + Context       | Auth guard, lazy loading, provider nesting                |
| [frontend/src/store/AuthContext.tsx](frontend/src/store/AuthContext.tsx)                                 | Context API + custom hook                   | Centralized auth state; clean hook interface              |
| [frontend/src/api/client.ts](frontend/src/api/client.ts)                                                 | Typed fetch wrapper                         | DRY API calls; centralized error handling; type safety    |
| [frontend/src/components/Layout/DashboardLayout.tsx](frontend/src/components/Layout/DashboardLayout.tsx) | Dark mode toggle + layout                   | Tailwind dark mode class-based strategy                   |
| [frontend/src/index.css](frontend/src/index.css)                                                         | Tailwind + custom theme                     | Dark mode colors (turquoise-purple); CSS variables        |
| [Dockerfile](Dockerfile) + [start.sh](start.sh)                                                          | Multi-stage build + Gunicorn entrypoint     | Railway buduje obraz z tego pliku                         |

## Frontend Setup & Build

```bash
cd frontend
npm install                # First time only
npm run dev                # Vite dev server on :3000 (proxies to Flask :5000)
npm run build              # Build SPA to frontend/dist/
npm run preview            # Preview production build
```

**Important**: Flask serves the built frontend from `frontend/dist/`. After frontend changes, run `npm run build` before testing with Python directly. Docker builds the frontend automatically as part of the multi-stage Dockerfile.

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
{ "error": "Task not found", "status": 404 }
```

**HTTP Status Codes**

- `200` - Success (GET, PATCH)
- `201` - Created (POST)
- `400` - Bad request (validation error)
- `401` - Unauthorized (not logged in)
- `403` - Forbidden (permission denied)
- `404` - Not found
- `409` - Conflict (e.g. blocked task completion, dependency cycle)
- `429` - Rate limit exceeded

## Environment Variables

Key `.env` variables (see [.env.example](.env.example) for full list):

```
SECRET_KEY=...                     # WYMAGANE - random 32-byte hex
CORS_ORIGINS=...                   # https://twoja-domena.com
FLASK_ENV=production
SOCKETIO_ASYNC_MODE=gthread        # gthread for Gunicorn, threading for dev
ENABLE_SCHEDULER=true
LOG_LEVEL=INFO
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=...         # Change before first deploy
DEFAULT_ADMIN_EMAIL=...
```

**Socket.IO Async Mode:**

- `threading` — Local Flask dev server
- `gthread` — Docker / Gunicorn (Railway runtime)
- ❌ **Avoid `eventlet`** — Deprecated, known compatibility issues

## Authorization Layer (Team Workspaces)

TaskMaster2 enforces multi-tenancy via the team_workspaces feature. Every team-scoped resource (task, project, comment, subtask, tag, saved_filter, task_template, recurring_task, notification, activity_log, custom_field, task_dependency, project_template) carries a `team_id` foreign key. The auth layer plus a small set of helpers keep cross-team access impossible.

### Roles (R2)

- `super_admin` — `team_id IS NULL`. Operates above teams via `/admin/...` endpoints. Does NOT see team-scoped resources through standard endpoints (R9.6).
- `manager` — Bound to exactly one team (`team_id NOT NULL`). Equivalent of legacy admin but scoped to a single team.
- `user` — Bound to exactly one team. Sees only own assigned tasks and projects they're a member of.

A CHECK constraint (`ck_user_team_role_consistency`) enforces the role/team invariant at the DB level.

### Decorators (`utils/auth_decorators`)

```python
from utils.auth_decorators import require_role, require_team_member, require_super_admin, require_manager_or_super

@tasks_bp.route('/tasks', methods=['GET'])
@login_required           # alias for @require_team_member
def get_tasks(): ...

@admin_bp.route('/admin/teams', methods=['POST'])
@require_super_admin
def create_team(): ...

@admin_bp.route('/admin/users/<int:user_id>/role', methods=['POST'])
@require_role('super_admin')
def change_user_role(user_id): ...
```

`@login_required` is preserved as an alias of `@require_team_member` for backward compat.

### Scoping helpers (`utils/scoping`)

```python
from utils.scoping import team_scoped, get_team_resource_or_404

# Lists: always scope the base query
tasks = team_scoped(Task.query, Task).filter_by(status='todo').all()

# Single resource: 404 if cross-team
task = get_team_resource_or_404(Task, task_id)
```

`team_scoped(query, Model)` reads `g.current_team_id` and silently returns an empty result for super_admin (so `/tasks` returns `[]` for super_admin per R9.6 — they should use `/admin/teams/<id>/...` instead).

### Auth layer (`utils/auth_layer`)

Registered in `app.py::create_app` after blueprints. Runs as a `before_request` hook on every API call:

1. Public path whitelist (`/health`, `/ready`, `/version`, `/auth/login`, `/auth/signup`, `/auth/signup-info`, static assets) → pass through.
2. Loads user from `session['user_id']`; missing → 401.
3. Compares `session['session_version']` with `User.session_version`; mismatch → 401 with `code: 'session_stale'`.
4. If user has a team and team is archived → 403 with `code: 'team_archived'`.
5. Populates `g.current_user`, `g.current_team_id`, `g.current_role`.

Bumping `User.session_version` (e.g. on team move, role change, archive) atomically invalidates every active session for that user.

### Per-team Socket.IO rooms (R22, design 5)

Connect handler in `utils/realtime`:

- Super admin → joins `super_admin` room.
- Manager/user → joins `team:<team_id>` room.
- Anything else → connection rejected.

Every `socketio.emit('task_action', ...)` and `socketio.emit('notification', ...)` must include `room=f'team:{task.team_id}'` to prevent cross-team leak.

### Denormalized team_id

`Comment`, `Subtask`, `TaskDependency`, `CustomField` carry their own `team_id` (denormalized from parent task) so that scoped queries don't need a join. **When creating these resources from a route handler, set `child.team_id = parent_task.team_id` before commit.** Missing this is the most common source of "user can't see their own comment" bugs.

### Performance (Task 21, design 15)

Composite indexes from migration `2c8e44f754b0` cover the hot query paths:

- `ix_task_team_due` (team_id, due_date) WHERE completed=false
- `ix_task_team_status` (team_id, status)
- `ix_notification_team_user_unread` (team_id, user_id) WHERE read=false
- `ix_activity_team_created` (team_id, created_at DESC)

**When listing many tasks**, use the `_eager_task_options()` helper in `routes/tasks.py` to avoid N+1 queries:

```python
tasks = visible_task_query(user).options(*_eager_task_options()).all()
```

**When listing projects**, use `_eager_project_options()` from `routes/projects.py` to preload tasks and their relationships:

```python
projects = team_scoped(Project.query, Project).options(*_eager_project_options()).all()
```

**Dashboard aggregation** — `/stats/dashboard` uses DB-level `.count()`, `.with_entities()`, and `.group_by()` instead of loading all tasks into Python memory. Follow this pattern for any new stats endpoints:

```python
base = visible_task_query(user)
total = base.count()
priority_rows = base.with_entities(Task.priority, db.func.count(Task.id)).group_by(Task.priority).all()
```

**Pagination defaults** — Unbounded list endpoints should be avoided. Current defaults:
- `/tasks` — page=1, per_page=50 (max 100)
- `/tasks/filter` — page=1, per_page=500 (max 1000)
- `/tasks/search` — page=1, per_page=20 (max 200)
- `/tasks/by-project` — limit=500 (max 1000)

Benchmark suite: `scripts/seed_perf.py` + `scripts/perf_bench.py`.

## Common Pitfalls

- **Missing team_id on denormalized resources** - When creating `Comment`, `Subtask`, `TaskDependency`, `CustomField`, always set `child.team_id = parent_task.team_id`. Otherwise scoped queries silently exclude the row.
- **Cross-team references** - When accepting `assignee_ids` / `member_ids` / `depends_on_task_id` from request bodies, validate every referenced entity has the current `team_id`. Raise `CrossTeamReferenceError` (400 `cross_team_reference`) on mismatch.
- **Socket.IO room scope** - `socketio.emit('task_action', payload)` without `room=f'team:{team_id}'` leaks events to other teams. Always pass `room=`.
- **N+1 in list endpoints** - Use `selectinload`/`joinedload` (`_eager_task_options()` for tasks, `_eager_project_options()` for projects) when serializing many items via `to_dict()`. Without it, `/tasks?per_page=50` issues 250+ queries.
- **Marshmallow v3.x compatibility** - Use `load_default` instead of `default` for field defaults in schemas.
- **Decorator stacking** - `@app.route()` must come BEFORE `@login_required` in the decorator stack.
- **Import-time binding** - `from utils.email_sender import enqueue_email` creates a local reference at import time. Monkeypatching `utils.email_sender.enqueue_email` won't affect calls in the importing module. Always use `from utils import email_sender` and call `email_sender.enqueue_email(...)` so lookups go through attribute access.
- **Toast with undo action** — `addToast(message, type, { undo: () => ... })` shows a "Cofnij" button that stays visible for 6 seconds. Used after task/bulk deletion to allow client-side recreation of deleted resources.
- **Password complexity** — Signup, admin create user, change-password, and reset-password enforce: uppercase letter, digit, special character (`!@#$%^&*(),.?":{}|<>_-+=`). Validation is in `schemas.py` (SignupSchema, AdminUserCreateSchema) and inline in `routes/auth.py`.
- **WebSocket workers** - With Gunicorn use `gthread`. For local development, `threading` is preferred (avoid `eventlet`).
- **Port Conflicts**: Port 5000 (Flask dev) - sprawdz przez `lsof -i :5000` / `netstat -ano | findstr :5000`. Na Railway Gunicorn binduje sie na `$PORT`.
- **Frontend not built**: Flask serves `frontend/dist/`. After frontend edits run `npm run build` (or rebuild Docker image).
- **Socket.IO Emission**: Any POST/PATCH/DELETE that modifies task state MUST emit `socketio.emit('task_action', ...)` with `room=f'team:{team_id}'`. Without it, other clients won't see updates.
- **Session Timeout**: Session-based auth invalidated by bumping `User.session_version`. Use this on team move, role change, archive.
- **Large Files**: `app.py` and `routes/tasks.py` are sizeable. When editing, use `str_replace` with 3+ lines of context to avoid ambiguous matches.
- **Cascade Deletes**: Models use `cascade='all, delete-orphan'`. Deleting a parent (e.g., Task) automatically deletes children (e.g., Subtasks, Comments). Be careful with migrations affecting parent-child relationships.
- **SQLite concurrency**: SQLite is single-writer. For >20 concurrent users consider PostgreSQL. Current setup is sized for self-hosted internal use.

## Local Troubleshooting

**Port 5000 already in use:**

```bash
# Linux / macOS
lsof -i :5000
kill -9 <PID>
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

**Flask dev server not reloading:**

- Set `FLASK_ENV=development`
- Make sure files aren't in `.venv/` or `node_modules/`

**Socket.IO connection timeout:**

1. Verify Flask is running: `lsof -i :5000`
2. Check `CORS_ORIGINS` matches frontend URL
3. Browser DevTools → Network → check socket URL

**npm install issues:**

```bash
cd frontend
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

## Health Checks

Aplikacja udostępnia dwa endpointy do monitorowania:

- `GET /health` - prosty health check (zwraca 200 jeśli proces żyje)
- `GET /ready` - readiness (sprawdza DB + Socket.IO)

Docker `HEALTHCHECK` zdefiniowany w `Dockerfile` waliduje endpoint `/health` przy starcie kontenera.

## Related Instruction Files

When modifying this codebase, agents should follow these domain-specific guidelines:

| File                                                                                                  | Purpose                                                 | Apply To                                                 |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| [Socket.IO Patterns](.github/instructions/socketio-patterns.instructions.md)                          | Real-time sync emission and listener patterns           | `routes/**/*.py`, `frontend/src/store/SocketContext.tsx` |
| [Frontend TypeScript Guidelines](.github/instructions/frontend-typescript-guidelines.instructions.md) | React, TypeScript, Context API, Tailwind best practices | `frontend/src/**/*.tsx`, `frontend/src/**/*.ts`          |
| [Python Security Guidelines](.github/instructions/python-security-guidelines.instructions.md)         | Secure credential & secret handling                     | `**/*.py`                                                |
| [Python Test Guidelines](.github/instructions/python-test-guidelines.instructions.md)                 | TDD requirement: automated tests for all Python changes | `**/*.py`                                                |
| [Python Conventions Skill](.github/skills/python-conventions/SKILL.md)                                | Code style and pragmatic conventions                    | `**/*.py`                                                |

## Available Agent Skills

- [Socket.IO Patterns](.github/instructions/socketio-patterns.instructions.md) - Real-time sync implementation guide.
- [Frontend TypeScript Guidelines](.github/instructions/frontend-typescript-guidelines.instructions.md) - Frontend best practices.
- [Python Test Guidelines](.github/instructions/python-test-guidelines.instructions.md) - TDD requirements for tests.

## Refactoring & Code Quality

- **Large Files**: `app.py` and `routes/tasks.py` are large. When modifying, use `str_replace` with sufficient context.
- **Modularity**: New features should be broken out into separate modules in `routes/`, `models/`, or `utils/`.
- **Real-time consistency**: Any state-changing operation (Create/Update/Delete) MUST be followed by a `socketio.emit('task_action', ...)`.
- **Frontend State**: The frontend reloads the entire task list (`loadTasks()`) on any remote change. For performance with many tasks, consider partial state updates in the future.
