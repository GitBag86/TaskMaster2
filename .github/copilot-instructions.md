---
description: AI coding agent instructions for TaskMaster2 workspace
---

# TaskMaster2 — Agent Instructions

**TaskMaster2** is a full-stack task management application (Flask REST API + React/TypeScript SPA) with Socket.IO real-time synchronization, role-based access control, and PWA support.

## 🚀 Start Here

- **For detailed architecture, patterns, and key files**: See [AGENTS.md](../AGENTS.md)
- **For Python code style and conventions**: See `.github/skills/python-conventions/SKILL.md`
- **For Python security guidelines**: See `.github/instructions/python-security-guidelines.instructions.md`
- **For test requirements (TDD)**: See `.github/instructions/python-test-guidelines.instructions.md`
- **For Socket.IO real-time sync patterns**: See `.github/instructions/socketio-patterns.instructions.md`
- **For frontend TypeScript guidelines**: See `.github/instructions/frontend-typescript-guidelines.instructions.md`

## Quick Decision Tree

**What are you doing?**

1. **Adding a new REST endpoint?**
   - Create route in `routes/` (e.g., `routes/tasks.py`)
   - Add Marshmallow schema for validation in `schemas.py`
   - If mutating state (POST/PATCH/DELETE): emit `task_action` event via Socket.IO
   - Add pytest tests in `tests/`

2. **Modifying database schema?**
   - Update SQLAlchemy model in `models.py`
   - Run `flask db migrate -m "description"`
   - Run `flask db upgrade`
   - Add tests for schema changes

3. **Adding a new frontend page or component?**
   - Create component in `frontend/src/components/`
   - Lazy-load route in `frontend/src/App.tsx` with `React.lazy()` + `Suspense`
   - Use Context hooks (`useAuth()`, `useSocket()`, `useTheme()`) for state
   - Style with Tailwind; check dark mode

4. **Fixing a sync or real-time issue?**
   - **Critical**: Verify backend emits `socketio.emit('task_action', {...})` after mutations
   - Check browser console for Socket.IO connection and events
   - Frontend listeners in `frontend/src/store/SocketContext.tsx`

5. **Debugging or fixing existing code?**
   - Check `.github/instructions/` for Python, TypeScript, and Socket.IO guidelines
   - Review exemplary files in [AGENTS.md](../AGENTS.md#key-files--exemplary-patterns) for patterns
   - Read [AGENTS.md#common-pitfalls](../AGENTS.md#common-pitfalls) for known issues

## Key File Locations

| File | Purpose |
|------|---------|
| [app.py](../../app.py) | Flask app initialization, blueprints, Socket.IO setup |
| [models.py](../../models.py) | SQLAlchemy ORM models (User, Task, Comment, Subtask, etc.) |
| [schemas.py](../../schemas.py) | Marshmallow request validation (use `load_default`, not `default`) |
| [routes/](../../routes/) | Blueprint modules: `auth.py`, `tasks.py`, `users.py`, `stats.py`, `filters.py` |
| [frontend/src/App.tsx](../../frontend/src/App.tsx) | React root, route protection, context providers |
| [frontend/src/store/](../../frontend/src/store/) | Context API: Auth, Socket, Theme, Toast |
| [frontend/src/api/client.ts](../../frontend/src/api/client.ts) | Typed fetch wrapper for API calls |

## Critical Rules (Do Not Skip)

1. **Tests First (TDD)**: Write automated tests BEFORE implementation for all Python changes. No code without tests. See [Python Test Guidelines](.github/instructions/python-test-guidelines.instructions.md).
2. **Socket.IO Emission**: Every POST/PATCH/DELETE that changes task state MUST emit `task_action`. Without it, other clients won't see updates.
3. **Marshmallow v3.x**: Use `load_default`, not `default`, in schema field definitions.
4. **Decorator Order**: `@app.route()` MUST come BEFORE `@login_required()`.
5. **Frontend Build**: After frontend edits, run `cd frontend && npm run build` (Flask serves from `frontend/dist/`).
6. **Cascade Deletes**: Models use cascade deletes—deleting a parent task cascades to subtasks, comments, etc.

## Deployment

- **Development**: `docker-compose up --build` (Nginx + Flask, dostęp na https://localhost)
- **Frontend dev (z hot-reload)**: `cd frontend && npm run dev` (Vite na :3000, proxy do Flask :5000)
- **Self-hosted production**: Linux/Docker za Nginx + FortiGate. Pełna instrukcja w [DEPLOYMENT.md](../../DEPLOYMENT.md).

## Need More?

- [AGENTS.md](../AGENTS.md) — Architektura, exemplary files, common pitfalls, troubleshooting
- [DEPLOYMENT.md](../../DEPLOYMENT.md) — Wdrażanie na własnym serwerze (Nginx + Docker + SSL)
- [FORTIGATE_SETUP.md](../../FORTIGATE_SETUP.md) — Konfiguracja FortiGate
