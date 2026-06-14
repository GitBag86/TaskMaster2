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

### ✨ Frontend

- **Super Admin Console** — `/admin` is now the default super-admin landing page with retro/hackerman UI.
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
