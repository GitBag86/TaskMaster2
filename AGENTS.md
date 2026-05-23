# Task Management API - Agent Instructions

**TaskMaster2**: A full-stack task management application with a Flask REST API backend and React/TypeScript SPA frontend. Features role-based access control, subtasks, comments, real-time updates via Socket.IO, dark mode, and PWA support.

Deployment target: **self-hosted Docker on a Linux server (Ubuntu) behind Nginx + FortiGate**. SQLite is the only supported database.

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

| Task Type | First Steps | See Also |
|-----------|------------|----------|
| **New REST endpoint** | 1. Create route in `routes/` <br> 2. Add Marshmallow schema <br> 3. If POST/PATCH/DELETE: emit `task_action` <br> 4. Add pytest tests | [Socket.IO Patterns](#socket-io-real-time-sync), [Exemplary: routes/tasks.py](#key-files--exemplary-patterns) |
| **Database schema change** | 1. Update `models.py` <br> 2. `flask db migrate -m "desc"` <br> 3. `flask db upgrade` <br> 4. Add tests | [Common Pitfalls](#common-pitfalls) |
| **New frontend page/component** | 1. Create in `frontend/src/components/` <br> 2. Lazy-load in `App.tsx` <br> 3. Use `useAuth()`, `useSocket()`, `useTheme()` hooks <br> 4. Style with Tailwind | [Frontend Guidelines](#related-instruction-files), [Exemplary: DashboardLayout.tsx](#key-files--exemplary-patterns) |
| **Real-time sync issue** | 1. Check: Backend emits `socketio.emit()` after DB commit <br> 2. Verify: Frontend listens in `SocketContext.tsx` <br> 3. Check browser console for Socket.IO events | [Socket.IO Patterns](#socket-io-real-time-sync), [Pitfall: Missing Socket.IO Emit](#common-pitfalls) |
| **Bug or performance issue** | 1. Review [Common Pitfalls](#common-pitfalls) <br> 2. Check instruction files for domain-specific rules | [Pitfalls Table](#common-pitfalls) |

---

## 🚀 Quick Start

### Docker (Recommended)
```bash
docker-compose up --build
```
Aplikacja jest dostępna na `https://localhost` (przez Nginx z portami 80/443). Baza SQLite zapisuje się w `instance/tasks.db`.

### Lokalny development (bez Dockera)

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

### Database & Testing
```bash
flask db migrate -m "description"
flask db upgrade
pytest
```

---

## 🚀 Deployment (Self-hosted)

Aplikacja jest projektowana do uruchamiania na własnym serwerze Linux (Ubuntu) za Nginx + FortiGate. Pełna instrukcja: [DEPLOYMENT.md](DEPLOYMENT.md).

Skrót:
1. `./scripts/setup-ssl.sh taskmaster.local admin@taskmaster.local`
2. `cp .env.example .env` i uzupełnij wartości
3. `docker-compose up -d --build`
4. Otwórz porty 80/443 w UFW i FortiGate

Dla konfiguracji FortiGate zobacz [FORTIGATE_SETUP.md](FORTIGATE_SETUP.md).

---

## 🏗️ Architecture

### Technology Stack
- **Backend**: Flask 3.x + SQLAlchemy ORM + Marshmallow (validation/serialization)
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Database**: SQLite with Flask-Migrate (Alembic)
- **Real-Time**: Socket.IO for cross-client synchronization
- **Auth**: Session-based (user_id in Flask session)
- **Reverse Proxy**: Nginx (SSL termination, rate limiting, security headers)
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
- Rate limiting: enforced by Nginx (Auth: 5/min, API: 30/s)

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

| File | Pattern | Why It Matters |
|------|---------|---|
| [app.py](app.py) | Flask app factory + Socket.IO init | Entry point; SPA fallback routing, health/ready endpoints |
| [models.py](models.py) | SQLAlchemy models with relationships | Schema definition; cascade deletes, many-to-many tables |
| [schemas.py](schemas.py) | Marshmallow v3.x validation | Request validation; uses `load_default` (not `default`) |
| [routes/auth.py](routes/auth.py) | Auth + session | Input validation, error handling, custom decorators |
| [routes/tasks.py](routes/tasks.py) | Task CRUD + Socket.IO emission + pagination | Real-time sync pattern: emit after mutations |
| [frontend/src/App.tsx](frontend/src/App.tsx) | Route protection + Suspense + Context | Auth guard, lazy loading, provider nesting |
| [frontend/src/store/AuthContext.tsx](frontend/src/store/AuthContext.tsx) | Context API + custom hook | Centralized auth state; clean hook interface |
| [frontend/src/api/client.ts](frontend/src/api/client.ts) | Typed fetch wrapper | DRY API calls; centralized error handling; type safety |
| [frontend/src/components/Layout/DashboardLayout.tsx](frontend/src/components/Layout/DashboardLayout.tsx) | Dark mode toggle + layout | Tailwind dark mode class-based strategy |
| [frontend/src/index.css](frontend/src/index.css) | Tailwind + custom theme | Dark mode colors (turquoise-purple); CSS variables |
| [Dockerfile](Dockerfile) + [docker-compose.yml](docker-compose.yml) | Multi-stage build + Nginx + Flask | Production setup with reverse proxy |
| [nginx/conf.d/taskmaster.conf](nginx/conf.d/taskmaster.conf) | Reverse proxy + WebSocket | SSL, rate limiting, Socket.IO upgrade |

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
- `gthread` — Docker / Gunicorn (default in `docker-compose.yml`)
- ❌ **Avoid `eventlet`** — Deprecated, known compatibility issues

## Common Pitfalls

- **Marshmallow v3.x compatibility** - Use `load_default` instead of `default` for field defaults in schemas.
- **Decorator stacking** - `@app.route()` must come BEFORE `@login_required` in the decorator stack.
- **WebSocket workers** - With Gunicorn use `gthread`. For local development, `threading` is preferred (avoid `eventlet`).
- **Port Conflicts**: Port 5000 (Flask) and 80/443 (Nginx) - check with `lsof -i :5000` / `netstat -ano | findstr :5000`.
- **Frontend not built**: Flask serves `frontend/dist/`. After frontend edits run `npm run build` (or rebuild Docker image).
- **Socket.IO Emission**: Any POST/PATCH/DELETE that modifies task state MUST emit `socketio.emit('task_action', ...)`. Without it, other clients won't see updates.
- **Session Timeout**: Session-based auth means users are logged in as long as the session exists. Test logout thoroughly.
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

Docker `healthcheck` jest skonfigurowany dla `web` i `nginx` w `docker-compose.yml`.

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

- [Socket.IO Patterns](.vscode/prompts/socketio-patterns.prompt.md) - Real-time sync implementation guide.
- [Frontend Responsive Check](.vscode/prompts/frontend-responsive-check.prompt.md) - Validates responsive design and prevents UI overflow.
- [Post-Migration Check](.vscode/prompts/post-migration-check.prompt.md) - Ensures schema integrity after `flask db upgrade`.
- [Backend Test Generator](.vscode/prompts/backend-test-generator.prompt.md) - Scaffolds pytest suites for new endpoints.

## Refactoring & Code Quality

- **Large Files**: `app.py` and `routes/tasks.py` are large. When modifying, use `str_replace` with sufficient context.
- **Modularity**: New features should be broken out into separate modules in `routes/`, `models/`, or `utils/`.
- **Real-time consistency**: Any state-changing operation (Create/Update/Delete) MUST be followed by a `socketio.emit('task_action', ...)`.
- **Frontend State**: The frontend reloads the entire task list (`loadTasks()`) on any remote change. For performance with many tasks, consider partial state updates in the future.
