# Changelog

## Unreleased

### 🔐 Security Hardening

- **Socket.IO session invalidation**: Added `session_version` check in Socket.IO connect handler — connections are rejected when session is stale (team move, role change, archive, password reset).
- **Password reset session security**: Password reset now bumps `session_version` to invalidate all existing sessions.
- **ProxyFix protection**: `ProxyFix` middleware is now gated behind `FLASK_ENV=production` to prevent header spoofing in development.
- **Profile update validation**: Added `ProfileUpdateSchema` with email validation for `PUT /auth/me`.
- **Session fixation prevention**: Added `session.clear()` before establishing new sessions on login/signup.
- **Bootstrap password**: Removed hardcoded default admin password from `.env.example`.

### ✨ Features

- **Auto-archive completed tasks**: Tasks marked as done are automatically archived after 3 days (daily scheduler job).
- **Project member saving**: Fixed save button - now properly detects member changes before enabling save.
- **Drag-to-reorder API**: Added `PUT /tasks/reorder` endpoint and `position` column on Task model for persisting custom task ordering.
- **Migration**: Added `87436939ddff_add_task_position` — backfills position based on `created_at` per team, plus composite index `(team_id, position)`.

### ✨ Frontend

#### Inline Editing

- **TaskCard** — click title to edit inline (Enter saves, Escape cancels), click priority badge for inline 3-button selector, click assignee area for lazy-fetched user dropdown.
- **TaskTable** — same inline editing patterns adapted for table cells: pencil icon for title, click-to-select priority, click-to-select assignee.

#### Drag-to-Reorder

- **@dnd-kit integration** in card view: 6-dot grip handle (visible on hover), PointerSensor with 8px activation distance, rectSortingStrategy for smooth column reorder.
- **Persistence**: on drag-end, new order is sent to `PUT /tasks/reorder`; non-filtered items' positions preserved via interleaving algorithm.

#### Optimistic Updates

- **TasksPage** — `handleComplete` flips task status immediately before API call, reverts on error.
- **TodayPage** — `completeTask` and `startTask` apply optimistic state instantly via `patchTask` helper.
- **KanbanPage** — `handleDrop` moves card to target column instantly, snaps back on error.

#### Socket Event Refactoring

- **New hook `useSocketTaskEvents`** (`hooks/useSocketTaskEvents.ts`) — centralizes socket event routing (delete/update/create/bulk) with ref-based handlers to avoid stale closures.
- **4 pages updated** (TasksPage, TodayPage, KanbanPage, CalendarPage) — each replaced ~16 lines of duplicated useEffect + handleTaskEvent with a single `useSocketTaskEvents({...})` call.

#### Table View (Spreadsheet)

- **New component `TaskTable`** (`components/Tasks/TaskTable.tsx`) — 9 sortable columns (title, project, priority, status, assignee, due_date, subtask progress), client-side sorting via `useMemo`.
- **View toggle** — segmented button in TasksPage header switches between card grid and table.
- **Bulk selection** — checkbox column with indeterminate "select all" header.
- **Row striping**, hover effects, compact progress bars, complete checkmark per row.

#### Framer Motion Animations

- **TaskCard** — entry: opacity 0→1, y: 20→0, scale: 0.95→1; exit: opacity→0, scale→0.9; spring physics (stiffness 350, damping 30). Compatible with @dnd-kit (layout omitted, `!transition-none` during drag).
- **TaskTable rows** — entry: slide in from left (x: -20→0); exit: slide right + collapse (height→0); `layout` prop for smooth column-sort reordering.
- **AnimatePresence `mode="popLayout"`** — exiting elements pop out of flow; remaining items animate into place.

#### Per-Page Error Boundaries

- Each of 15 lazy-loaded routes wrapped in its own `<ErrorBoundary>` inside App.tsx.
- Crash in one page (e.g. TasksPage) only affects that page's content area — sidebar, nav, and other routes remain functional.
- Global `<ErrorBoundary>` kept as top-level safety net for providers/layout crashes.

#### Per-Route Suspense Fallbacks

- Moved from single global `<Suspense>` wrapping all `<Routes>` to per-route Suspense.
- Each route gets a page-specific skeleton: TasksPageSkeleton, KanbanSkeleton, CalendarSkeleton, DashboardSkeleton, ActivitySkeleton, AdminSkeleton.
- One lazy chunk loading no longer shows a full-screen spinner; only that page's area shows its skeleton while sidebar/nav stay interactive.

#### Super Admin Console

- `/admin` is now the default super-admin landing page with retro/hackerman UI.
- Added super-admin console navigation entry and identity matrix for loaded users across workspaces.
- Super-admin console supports adding users into a selected active workspace and terminating user accounts.

## v1.0 (2026-06-07)

### 🏢 Multi-Tenancy (Team Workspaces)

- **Trzy poziomy uprawnień**: super_admin, manager, user — pełna izolacja danych między zespołami
- **Panel super-admina**: zarządzanie zespołami, użytkownikami, rolami, globalny audit log
- **Team CRUD**: tworzenie, edycja, archiwizacja, usuwanie zespołów
- **Invite tokens**: jednorazowe zaproszenia z SHA-256 hashem, 7-dniowa ważność
- **Przenoszenie użytkowników** między zespołami z atomiczną migracją danych
- **CHECK constraint** na User (`super_admin` → NULL, `manager`/`user` → NOT NULL)
- **Team-scoped resources**: 12 tabel z `team_id` NOT NULL

### 🔐 Bezpieczeństwo

- **CSRF protection**: Flask-WTF z auto-odświeżaniem tokena co 20 minut
- **Rate limiting**: Flask-Limiter na endpointach auth (5 req/min)
- **Session security**: HttpOnly, Secure, SameSite=Lax, bump `session_version`
- **Fix FK cascade**: bezpieczne usuwanie użytkowników i zespołów

### 🚀 Deployment i Infrastruktura

- **Railway**: Dockerfile multi-stage, pre-deploy, health checks
- **PostgreSQL**: wsparcie produkcyjne (Railway managed)
- **Docker Compose**: `docker compose up -d` do lokalnego uruchomienia
- **Gunicorn gthread**: prod runtime z Socket.IO

### ✨ Frontend

- **Onboarding wizard**: pierwsze logowanie managera
- **Command Palette**: Ctrl+K z szybkim dodawaniem zadań
- **Kanban drag-and-drop** z płynnymi animacjami
- **Mobile-first**: responsywne tabele, dot-scroll
- **Skeletons, empty states, inline validation**
- **PWA**: manifest + service worker

### 🧪 Testy i Jakość

- **220 testów backend** (pytest): izolacja, admin, scope, migracje
- **18 testów frontend** (vitest)
- **N+1 query fixes**: eager loading, batch resource counts, audit pagination
- **Refaktoring**: ekstrakcja projektów, shared Modal, emit helpers

### 📚 Dokumentacja

- DOCS.md (16 sekcji), USER_GUIDE.md (16 sekcji), README.md, AGENTS.md
- GitHub Release v1.0

---

## v0.x (Development phase)

### Stabilizacja i hardening

- Flask-Limiter rate limiting + przejście na PostgreSQL
- CSRF protection z Flask-WTF
- Poprawki Socket.IO na Cloud Run
- Poprawki bezpieczeństwa: sesje, walidacja email w InviteForm
- Fix N+1 queries, batch team resource counts

### UX i design

- URL-persisted filters, keyboard shortcuts, mobile table cards
- Skeleton loading, double-submit guards
- Kanban animations, Command Palette z nawigacją klawiszową
- Empty states we wszystkich widokach

### Architektura

- Containerization z Docker Compose
- Ekstrakcja modułu projects + emit helpers
- Partial Socket.IO state updates
- Refaktoryzacja ActivityPage, shared Modal

### Wczesny development

- Inicjalizacja projektu: Flask + React + TypeScript
- Podstawowe modele: Task, User, Project, Comment, Subtask
- Auth: login, signup, sesje
- Widoki: lista zadań, projekty, kalendarz, aktywność
- Kanban, dashboard statystyk
- Szybkie dodawanie z Command Palette
- Zależności między zadaniami, blokady zamknięcia
- Szablony projektów z gotowymi zadaniami
- E-mail notifications z HTML szablonami
- Socket.IO do synchronizacji w czasie rzeczywistym
