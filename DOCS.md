# TaskMaster2 — Dokumentacja techniczna  <img src="https://img.shields.io/badge/version-1.0-success" alt="v1.0">

**v1.0** — Pełna dokumentacja techniczna aplikacji TaskMaster2 dla developerów i administratorów.

> © 2026 Krzysztof Graczyk. Wszelkie prawa zastrzeżone. Patrz [LICENSE](LICENSE).

---

## Spis treści

1. [Przegląd](#1-przegląd)
2. [Architektura](#2-architektura)
3. [Stack technologiczny](#3-stack-technologiczny)
4. [Model danych](#4-model-danych)
5. [Multi-tenancy (Team Workspaces)](#5-multi-tenancy-team-workspaces)
6. [Authorization Layer](#6-authorization-layer)
7. [API Reference](#7-api-reference)
8. [Real-time (Socket.IO)](#8-real-time-socketio)
9. [Frontend](#9-frontend)
10. [Migracje bazy danych](#10-migracje-bazy-danych)
11. [Deployment](#11-deployment)
12. [Konfiguracja](#12-konfiguracja)
13. [Bezpieczeństwo](#13-bezpieczeństwo)
14. [Wydajność](#14-wydajność)
15. [Testy](#15-testy)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Przegląd

**TaskMaster2** to fullstack-owa aplikacja webowa do zarządzania zadaniami zespołowymi z izolacją multi-tenant (workspaces). Stack: Flask 3 (backend) + React 18 + TypeScript (frontend), SQLite jako baza, Docker (multi-stage Dockerfile) jako artefakt runtime; deploy na Railway za ich edge proxy.

**Kluczowe cechy:**

- Multi-tenancy z trzema poziomami uprawnień (super_admin / manager / user)
- Pełna izolacja danych między zespołami (constraint na poziomie bazy)
- Real-time sync przez Socket.IO z per-team rooms
- Zarządzanie zadaniami: priorytety, statusy, zależności, podzadania, komentarze, tagi, filtry
- Widoki: Lista, Dziś, Kanban, Kalendarz, Dashboard, Aktywność
- Szablony projektów (per-team, edytowalne)
- Invite tokens dla self-signup w trybie `invite_only`
- Audit log dla operacji administracyjnych
- Powiadomienia: w-app + e-mail
- PWA (manifest, service worker)
- Dark mode (Tailwind class-based)

---

## 2. Architektura

```
                  Internet
                     ↓ HTTPS (443)
            ┌────────────────────┐
            │   Railway edge     │  ← SSL/TLS, WebSocket upgrade, request routing
            └─────────┬──────────┘
                      ↓ HTTP ($PORT)
            ┌─────────────────────┐
            │  Gunicorn (gthread) │
            │  ↓                  │
            │  Flask app          │  ← REST API + Socket.IO
            │  ↓                  │
            │  SQLAlchemy ORM     │
            └─────────┬───────────┘
                      ↓
            ┌──────────────────────────┐
            │  PostgreSQL (Railway)    │  ← Managed via DATABASE_URL
            │  lub SQLite (lokalnie)   │  ← instance/tasks.db
            └──────────────────────────┘
```

Aplikacja zyje w pojedynczym kontenerze Dockera (multi-stage build: frontend + Python). Frontend SPA jest budowany w czasie buildu obrazu i serwowany jako statyki przez Flaska z `frontend/dist/`.

### Komunikacja real-time

```
Client A (browser, team_id=1)              Client B (browser, team_id=1)
     │                                            │
     │  WS: /socket.io                            │  WS: /socket.io
     ▼                                            ▼
┌──────────────────────────────────────────────────────────┐
│                   Socket.IO server                       │
│                                                          │
│   joined rooms:                                          │
│     Client A → 'team:1'                                  │
│     Client B → 'team:1'                                  │
│     Super admin → 'super_admin'                          │
└──────────────────────────────────────────────────────────┘
                                ↑
                         emit(room='team:1')
                                │
                  Backend route handler (after DB commit)
```

---

## 3. Stack technologiczny

### Backend

| Komponent               | Wersja | Rola                 |
| ----------------------- | ------ | -------------------- |
| Python                  | 3.14   | Runtime              |
| Flask                   | 3.0.3  | Web framework        |
| Flask-SQLAlchemy        | 3.1.1  | ORM                  |
| Flask-Migrate (Alembic) | latest | Migracje             |
| Flask-SocketIO          | latest | Real-time            |
| Flask-Mail              | 0.9.1  | E-maile              |
| Flask-APScheduler       | 1.13.1 | Background jobs      |
| Marshmallow             | 3.21.2 | Walidacja            |
| Werkzeug                | 3.0.2  | WSGI utils, security |
| Gunicorn                | 21.2.0 | App server           |
| psycopg                 | 3.2+   | PostgreSQL adapter    |

### Frontend

| Komponent        | Wersja | Rola                   |
| ---------------- | ------ | ---------------------- |
| React            | 18     | UI framework           |
| TypeScript       | 5.x    | Type safety            |
| Vite             | 5.4    | Build tool, dev server |
| Tailwind CSS     | 3.x    | Styling                |
| React Router     | 6      | Routing                |
| Socket.IO client | latest | Real-time              |
| Recharts         | latest | Wykresy                |

### Infrastructure

- Docker (multi-stage Dockerfile: Node frontend builder + Python runtime)
- Railway jako platforma hostingowa (edge proxy, SSL, deploy z GitHub)
- **PostgreSQL** (Railway managed) — używany w produkcji, konfigurowany przez `DATABASE_URL`
- SQLite — używany lokalnie do developmentu (`instance/tasks.db`)
- Docker (multi-stage: Node builder + Python runtime) — artefakt deployu

---

## 4. Model danych

Pełne definicje: [`models.py`](models.py).

### Encje główne

```
User
 ├─ team_id (FK → Team) NULL dla super_admin
 ├─ role: super_admin | manager | user
 ├─ session_version (do unieważniania sesji)
 ├─ tasks (1:N owner)
 ├─ assigned_tasks (M:N przez task_assignees)
 └─ member_projects (M:N przez project_members)

Team
 ├─ slug (unique)
 ├─ archived (bool)
 ├─ members (1:N User)
 ├─ invites (1:N TeamInvite)
 └─ project_templates (1:N ProjectTemplate)

Task
 ├─ team_id (FK)
 ├─ project_id (FK Project)
 ├─ user_id (owner)
 ├─ assignees (M:N User)
 ├─ comments, subtasks, dependencies, tags, custom_fields
 └─ to_dict() zawiera blocked_by, blocking, is_blocked

Project
 ├─ team_id (FK)
 ├─ unique (team_id, LOWER(name)) WHERE archived=false
 ├─ members (M:N User)
 └─ tasks (1:N)

TaskDependency, Subtask, Comment, CustomField
 ├─ task_id (FK Task)
 └─ team_id (denormalized z parent task)

Tag, SavedFilter, TaskTemplate, ProjectTemplate, Notification, ActivityLog
 └─ team_id (FK Team)

TeamInvite
 ├─ token_hash (sha256 of raw token)
 ├─ expires_at, consumed_at
 └─ default_role (zawsze 'user' z perspektywy managera)

TeamAuditLog
 └─ Tylko widoczny dla super_admin
```

### Indeksy kluczowe

Dodane przez migrację `2c8e44f754b0`:

| Indeks                             | Tabela                                              | Cel                          |
| ---------------------------------- | --------------------------------------------------- | ---------------------------- |
| `ix_task_team_due`                 | task (team_id, due_date) WHERE completed=false      | /tasks/today, /tasks/blocked |
| `ix_task_team_status`              | task (team_id, status)                              | filtry statusów              |
| `ix_notification_team_user_unread` | notification (team_id, user_id) WHERE read=false    | widget powiadomień           |
| `ix_activity_team_created`         | activity_log (team_id, created_at DESC)             | feed aktywności              |
| `uq_project_team_name_lower`       | project (team_id, LOWER(name)) WHERE archived=false | unique per team              |
| `uq_tag_team_name_lower`           | tag (team_id, LOWER(name))                          | unique per team              |

### Constraints

- `ck_user_team_role_consistency` na User: `(role='super_admin' AND team_id IS NULL) OR (role IN ('manager', 'user') AND team_id IS NOT NULL)`

### Denormalizacja `team_id` na zasobach zagnieżdżonych

`Comment`, `Subtask`, `TaskDependency`, `CustomField` przechowują własne `team_id` (skopiowane z parent task przy utworzeniu). Dzięki temu zapytania scoped nie wymagają JOIN-a przez `task` — co znacząco poprawia wydajność list endpointów.

---

## 5. Multi-tenancy (Team Workspaces)

Każdy zasób team-scoped (12 tabel: task, project, tag, saved_filter, task_template, recurring_task, notification, activity_log, comment, subtask, task_dependency, custom_field) ma sztywne FK `team_id`. Constraint `NOT NULL` gwarantuje, że żaden zasób nie istnieje "luzem".

### Role

- **`super_admin`** — `team_id = NULL`. Operuje przez `/admin/...`. Nie widzi zasobów team-scoped przez standardowe endpointy (R9.6).
- **`manager`** — bound do jednego zespołu. Pełne uprawnienia wewnątrz zespołu. Generuje invite tokens (tylko z `default_role='user'`).
- **`user`** — bound do jednego zespołu. Widzi tylko zadania przypisane do siebie i projekty, w których jest członkiem.

### Izolacja

- Manager A → request `GET /tasks/<id>` z id z zespołu B → **404** (nie 403, by nie zdradzić istnienia).
- Cross-team `assignee_ids` / `member_ids` / `depends_on_task_id` → **400 `cross_team_reference`**.
- Per-team rooms Socket.IO — eventy z mutacji w zespole A nie docierają do zespołu B.

### Procedura migracji istniejących instancji

Migracje uruchamiaja sie automatycznie z `start.sh` (`flask db upgrade`) przy kazdym deploy. Dla wiekszych zmian schematu zrob backup pliku `tasks.db` (volume na Railway) zanim ruszysz z deployem.

---

## 6. Authorization Layer

Patrz: [`utils/auth_layer.py`](utils/auth_layer.py), [`utils/auth_decorators.py`](utils/auth_decorators.py), [`utils/scoping.py`](utils/scoping.py).

### Before-request hook

Rejestrowany przez `register_auth_layer(app)` w `app.py::create_app`. Dla każdego API requesta:

1. Public path whitelist (`/health`, `/ready`, `/version`, `/auth/login`, `/auth/signup`, `/auth/signup-info`, `/socket.io/*`, statyki) → pass.
2. Ładuje user z `session['user_id']`. Brak → **401**.
3. Sprawdza `session['session_version'] == User.session_version`. Mismatch → **401 `session_stale`**.
4. Jeśli user ma team i team jest archived → **403 `team_archived`**.
5. Wpisuje `g.current_user`, `g.current_team_id`, `g.current_role`.

### Decoratory

```python
from utils.auth_decorators import require_team_member, require_super_admin, require_role

@tasks_bp.route('/tasks', methods=['GET'])
@login_required          # alias dla @require_team_member
def get_tasks(): ...

@admin_bp.route('/admin/teams', methods=['POST'])
@require_super_admin
def create_team(): ...

@admin_bp.route('/admin/users/<int:user_id>/role', methods=['POST'])
@require_role('super_admin')
def change_role(user_id): ...
```

### Scoping helpers

```python
from utils.scoping import team_scoped, get_team_resource_or_404

# Lista zasobów scoped per team
tasks = team_scoped(Task.query, Task).filter_by(status='todo').all()

# Single resource — 404 jeśli cross-team
task = get_team_resource_or_404(Task, task_id)
```

`team_scoped` zwraca pustą listę dla super_admin (R9.6) — używa endpointów `/admin/...`.

### Bumping session_version

Bump na: team move, role change, archived team. Atomicznie unieważnia wszystkie aktywne sesje danego usera.

```python
target_user.session_version += 1
db.session.commit()
```

---

## 7. API Reference

Wszystkie endpointy zwracają JSON. Errory: `{"error": "msg", "code": "stable_code"}`.

### Auth

| Endpoint                      | Metoda | Opis                                                       |
| ----------------------------- | ------ | ---------------------------------------------------------- |
| `/auth/signup`                | POST   | Rejestracja. Wymaga `invite_token` w trybie `invite_only`. |
| `/auth/signup-info?token=...` | GET    | Tryb signup + nazwa zespołu (publiczny).                   |
| `/auth/login`                 | POST   | Logowanie.                                                 |
| `/auth/logout`                | POST   | Wylogowanie.                                               |
| `/auth/me`                    | GET    | Aktualny user (`team_id`, `role`, opcjonalnie `team`).     |

### Tasks

| Endpoint                               | Metoda       | Opis                                                             |
| -------------------------------------- | ------------ | ---------------------------------------------------------------- |
| `/tasks?page=1&per_page=50`            | GET          | Paginowana lista (manager: wszystkie, user: tylko swoje).        |
| `/tasks`                               | POST         | Utworzenie zadania (`team_id` ustawiane automatycznie).          |
| `/tasks/<id>`                          | PUT, DELETE  | Update / usunięcie.                                              |
| `/tasks/<id>/complete`                 | PUT          | Toggle zakończenia (blokowane przez open dependencies/subtasks). |
| `/tasks/today`                         | GET          | Widok Dziś (overdue / today / upcoming + counts).                |
| `/tasks/blocked`                       | GET          | Zadania zablokowane przez open dependencies.                     |
| `/tasks/dependency-board`              | GET          | Panel blokad z `blockers`, `blocked`, `ready`.                   |
| `/tasks/search?q=...`                  | GET          | Pełnotekstowe wyszukiwanie.                                      |
| `/tasks/filter?...`                    | GET          | Filtry (assigned_to, priority, project, completed).              |
| `/tasks/quick-add`                     | POST         | Parser tokenów `+` z hashtagami / wzmianami.                     |
| `/tasks/bulk/{complete,delete,update}` | PUT/DEL      | Operacje masowe.                                                 |
| `/tasks/<id>/dependencies`             | GET, POST    | Zarządzanie zależnościami.                                       |
| `/dependencies/<id>`                   | DELETE       | Usunięcie zależności.                                            |
| `/tasks/<id>/comments`                 | POST         | Dodanie komentarza (mention resolution per team).                |
| `/tasks/<id>/subtasks`                 | POST         | Dodanie podzadania.                                              |
| `/subtasks/<id>/complete`              | PUT          | Toggle podzadania.                                               |
| `/tasks/<id>/tags/<tag_id>`            | POST, DELETE | Add/remove tag.                                                  |

### Projects

| Endpoint                      | Metoda      | Opis                                                   |
| ----------------------------- | ----------- | ------------------------------------------------------ |
| `/projects`                   | GET, POST   | Lista / utworzenie. `member_ids` musi należeć do team. |
| `/projects/<id>`              | PUT, DELETE | Update / archiwizacja.                                 |
| `/projects/<id>/completion`   | GET         | Checklista gotowości.                                  |
| `/projects/<id>/complete`     | POST        | Zakończenie (musi spełnić checklistę).                 |
| `/project-templates`          | GET         | Lista per-team (po seed: 3 wpisy).                     |
| `/project-templates/<id>/use` | POST        | Tworzenie projektu z szablonu.                         |

### Stats / Activity

| Endpoint              | Metoda | Opis                              |
| --------------------- | ------ | --------------------------------- |
| `/stats/dashboard`    | GET    | Statystyki dashboardu (per team). |
| `/reports/weekly`     | GET    | Raport tygodniowy (per team).     |
| `/activity?limit=100` | GET    | Feed aktywności (per team).       |

### Filters / Notifications / Tags / Templates

| Endpoint                                   | Metoda    | Opis                          |
| ------------------------------------------ | --------- | ----------------------------- |
| `/filters`                                 | GET, POST | Saved filters per team.       |
| `/filters/<id>`                            | DELETE    | Usunięcie filtra.             |
| `/notifications?limit=20&unread_only=true` | GET       | Powiadomienia użytkownika.    |
| `/notifications/<id>/read`                 | POST      | Oznacz jako przeczytane.      |
| `/tags`                                    | GET, POST | Tagi per team.                |
| `/tags/<id>`                               | DELETE    | Usunięcie tagu.               |
| `/templates`                               | GET, POST | Task templates per team.      |
| `/templates/<id>/use`                      | POST      | Tworzenie zadania z szablonu. |
| `/templates/<id>`                          | DELETE    | Usunięcie szablonu.           |

### Team Invites (manager)

| Endpoint             | Metoda | Opis                                                 |
| -------------------- | ------ | ---------------------------------------------------- |
| `/team/invites`      | GET    | Lista nieskonsumowanych invite.                      |
| `/team/invites`      | POST   | Wygenerowanie invite (raw_token zwracany tylko raz). |
| `/team/invites/<id>` | DELETE | Revoke.                                              |

### Admin (super_admin)

| Endpoint                    | Metoda      | Opis                                                               |
| --------------------------- | ----------- | ------------------------------------------------------------------ |
| `/admin/teams`              | GET, POST   | Lista / tworzenie zespołu (auto-seed templates).                   |
| `/admin/teams/<id>`         | PUT, DELETE | Update / usunięcie (`team_not_empty` jeśli nie pusty).             |
| `/admin/teams/<id>/archive` | POST        | Archiwizacja (bumpuje session_version członkom).                   |
| `/admin/teams/<id>/members` | GET         | Członkowie zespołu.                                                |
| `/admin/teams/<id>/audit`   | GET         | Audit log per team.                                                |
| `/admin/audit`              | GET         | Globalny audit log.                                                |
| `/admin/users/<id>/team`    | POST        | Move user — atomicznie: team_id, session_version, reasign content. |
| `/admin/users/<id>/role`    | POST        | Zmiana roli (validacja team_id).                                   |

### Health / Version

| Endpoint   | Metoda | Opis                               |
| ---------- | ------ | ---------------------------------- |
| `/health`  | GET    | Liveness — proces żyje?            |
| `/ready`   | GET    | Readiness — DB + Socket.IO gotowe? |
| `/version` | GET    | Wersja, git_sha, build_time.       |

### Error codes

| HTTP | code                   | Znaczenie                                              |
| ---- | ---------------------- | ------------------------------------------------------ |
| 400  | `cross_team_reference` | Próba referencji zasobu z innego zespołu.              |
| 401  | `session_stale`        | session_version mismatch — wymagane ponowne logowanie. |
| 403  | `team_archived`        | Twój zespół jest zarchiwizowany.                       |
| 403  | `signup_disabled`      | `SIGNUP_MODE=disabled`.                                |
| 409  | `team_not_empty`       | Próba usunięcia zespołu z zasobami.                    |
| 410  | `invite_token_invalid` | Token wygasł, skonsumowany lub nieistniejący.          |
| 429  | —                      | Rate limit (Flask-Limiter, jesli wlaczony).            |

---

## 8. Real-time (Socket.IO)

### Server

`extensions.py::socketio` + `utils/realtime.py::register_socketio_handlers()`. Tryb `gthread` w produkcji (Gunicorn), `threading` w devie.

### Connect handler

```python
@socketio.on('connect')
def on_connect():
    user_id = session.get('user_id')
    user = User.query.get(user_id)
    if not user:
        return False  # reject
    if user.role == 'super_admin':
        join_room('super_admin')
    elif user.team_id:
        team = db.session.get(Team, user.team_id)
        if not team or team.archived:
            return False
        join_room(f'team:{user.team_id}')
    else:
        return False
```

### Emit pattern

Każda mutacja zasobu team-scoped emituje event do roomu zespołu **po** db.session.commit():

```python
db.session.commit()
socketio.emit('task_action', {
    'action': 'create',
    'task_id': task.id,
    'task': task.to_dict(),
}, room=f'team:{task.team_id}')
```

### Eventy

| Event          | Payload                    | Trigger                                                      |
| -------------- | -------------------------- | ------------------------------------------------------------ |
| `task_action`  | `{action, task_id, task?}` | Create/update/delete/complete task.                          |
| `notification` | `{notification}`           | Nowe powiadomienie.                                          |
| `team_event`   | `{action, ...}`            | Zmiany na poziomie zespołu (archived, member added/removed). |

### Frontend

`frontend/src/store/SocketContext.tsx` zarządza połączeniem. Listener:

```ts
socket.on("task_action", () => {
  loadTasks();
  showToast("Lista zadań zaktualizowana");
});
```

---

## 9. Frontend

### Struktura

```
frontend/src/
├── api/
│   └── client.ts          # typed fetch wrapper, namespacy
├── components/
│   ├── Activity/, Admin/, Auth/, Calendar/
│   ├── Dashboard/, Kanban/, Layout/
│   ├── Projects/, Tasks/, Team/, Today/
│   └── common/            # RoleRoute, Toaster, Skeletons, CommandPalette
├── store/
│   ├── AuthContext.tsx    # currentUser, currentTeam, login/logout
│   ├── SocketContext.tsx  # WS connection
│   ├── ThemeContext.tsx   # dark mode
│   └── ToastContext.tsx
├── types/
│   └── index.ts           # User, Team, Task, Role, ...
├── App.tsx                # routing + providers + lazy load
├── main.tsx               # entrypoint
└── index.css              # Tailwind + custom theme
```

### Routing

Lazy-loaded routes w `App.tsx` z `<RoleRoute roles={[...]}>` jako guard:

```tsx
<Route
  path="/admin/teams"
  element={
    <RoleRoute roles={["super_admin"]}>
      <TeamsAdminPage />
    </RoleRoute>
  }
/>
```

### State management

React Context API — `AuthContext`, `SocketContext`, `ThemeContext`, `ToastContext`. Brak Reduxa, brak Recoila — projekt nie wymaga.

### API client

`api/client.ts` — typed fetch wrapper z namespacami:

```ts
api.tasks.list({ page: 1, per_page: 50 });
api.tasks.create({ title, project_id, assignee_ids });
api.teams.list();
api.invites.create({ default_role: "user" });
api.signup.info(token);
```

### Stylowanie

Tailwind CSS, dark mode `class`-based. Custom theme w `index.css` (turkusowo-fioletowy). Mobile-first responsive.

### Build

```bash
cd frontend
npm install
npm run build      # produkcja → frontend/dist/
npm run dev        # dev server na :3000 z proxy do :5000
```

---

## 10. Migracje bazy danych

Flask-Migrate (Alembic). Pliki w `migrations/versions/`.

### Workflow

```bash
flask db migrate -m "description"   # auto-detect zmian w models.py
# Edytuj plik migracji jeśli potrzeba data migration
flask db upgrade                    # apply
flask db downgrade -1               # rollback (jeśli musisz)
flask db history                    # lista wszystkich
flask db current                    # aktualna rewizja
```

### Kluczowe migracje team-workspaces

1. `a0a6a0fd5858` — utworzenie tabel `team`, `team_invite`, `team_audit_log`.
2. `5700fc57959b` — `User.team_id` i `session_version`.
3. `ccbe104854e4` — tabela `project_template` (per-team kopie).
4. `81d661ec5395` — schema + backfill: `team_id` na 12 tabelach, promotion bootstrap admina, default team, seed templates.
5. `2c8e44f754b0` — flip do `NOT NULL`, CHECK constraint, composite indexes.

### Best practices

- **Nigdy** nie usuwaj `instance/tasks.db` żeby zmienić schemat — używaj migracji.
- Dla data migration edytuj plik migracji ręcznie po `flask db migrate`.
- Idempotencja: każdy UPDATE z `WHERE col IS NULL`, INSERT z `ON CONFLICT DO NOTHING` / `INSERT OR IGNORE`.
- Test każdej migracji na pg_dump produkcji **zanim** ją zaaplikujesz live.

---

## 11. Deployment

Aplikacja deployuje sie na **Railway** (`Dockerfile`-based build). Push na `main` -> Railway buduje obraz z multi-stage Dockerfile -> uruchamia `start.sh` (Gunicorn gthread, port z `$PORT`).

### Quick start (Railway)

1. New Project -> Deploy from GitHub repo (wybierz to repo).
2. W zakladce Variables wklej zmienne z `.env.example` (minimum: `SECRET_KEY`, `CORS_ORIGINS`, `PUBLIC_BASE_URL`, dane SMTP).
3. (opcjonalnie) Settings -> Storage: dodaj Volume na `/app/instance` zeby SQLite przezyl restart kontenera.
4. Deploy. Aplikacja dostepna pod `https://<projekt>.up.railway.app`.

Bootstrap admin (`DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD`) tworzy sie automatycznie przy pierwszym starcie. Migracje DB uruchamiaja sie z `start.sh` (`flask db upgrade`).

### Update kodu

`git push origin main` -> Railway rebuild + redeploy automatycznie.

### Lokalny test buildu

```bash
docker build -t taskmaster2 .
docker run -p 5000:5000 --env-file .env taskmaster2
```

### Backup bazy

**PostgreSQL (Railway managed):**
```bash
railway run --service Postgres pg_dump -T "public".* -Fc > backup.dump
```
**SQLite (lokalny dev):**
```bash
cp instance/tasks.db instance/tasks.db.$(date +%F)
```

---

## 12. Konfiguracja

Wszystkie zmienne środowiskowe — patrz `.env.example`.

### Wymagane

```env
SECRET_KEY=<32-byte hex>            # python -c "import secrets; print(secrets.token_hex(32))"
CORS_ORIGINS=https://app.example.com
```

### Team workspaces

```env
SIGNUP_MODE=invite_only             # disabled | invite_only | default_team
INVITE_TOKEN_TTL_DAYS=7
SUPER_ADMIN_LANDING=/admin/teams
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=<silne haslo>
DEFAULT_ADMIN_EMAIL=admin@example.com
```

### Bootstrap admin

```env
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=<silne hasło>
DEFAULT_ADMIN_EMAIL=admin@example.com
```

### E-mail (opcjonalne)

```env
MAIL_SERVER=smtp.example.com
MAIL_PORT=587
MAIL_USE_TLS=True
MAIL_USERNAME=...
MAIL_PASSWORD=...
MAIL_DEFAULT_SENDER=noreply@example.com
```

### Inne

```env
FLASK_ENV=production
SOCKETIO_ASYNC_MODE=gthread          # gthread (prod) | threading (dev)
ENABLE_SCHEDULER=true
LOG_LEVEL=INFO
SESSION_COOKIE_SECURE=true           # false dla devu po HTTP
```

---

## 13. Bezpieczeństwo

### Hasła

- Hashowane przez Werkzeug (`generate_password_hash`/`check_password_hash`) — domyślnie scrypt z solą.
- Nigdy nie logowane, nie przesyłane w odpowiedziach.

### Sesje

- Cookie `session` HttpOnly, Secure, SameSite=Lax.
- Klucz sesji `SECRET_KEY` z `.env` — **nigdy** nie commituj.
- Bump `User.session_version` unieważnia sesje przy: team move, role change, team archive.

### Rate limiting

Aplikacja **nie wymusza** rate limitingu na poziomie kodu. Railway edge robi podstawowe filtrowanie nadużyć. Jeśli chcesz precyzyjne limity per-route, dodaj Flask-Limiter:

- `/auth/login`, `/auth/signup` — rekomendowane 5 requestów/min.
- `/api/*` — rekomendowane 30 r/s burst 30.

### Security headers

Sa konfigurowane w aplikacji Flask (`app.py`) lub Railway edge:

- HSTS (Railway dodaje automatycznie dla domen z SSL).
- `X-Frame-Options: SAMEORIGIN`.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: no-referrer-when-downgrade`.

### Walidacja

- Marshmallow schemas dla każdego POST/PUT.
- ORM (parametryzowane queries) chroni przed SQL injection.
- Frontend escapuje wartości w JSX automatycznie.
- W mailach HTML — `markupsafe.escape` dla user content.

### Cross-team isolation

- DB-level: constraint `NOT NULL` na `team_id`, CHECK na User.
- App-level: `team_scoped` + `get_team_resource_or_404`.
- WS-level: per-team rooms.
- 30+ parametrycznych testów isolation w `tests/test_cross_team_isolation.py`.

---

## 14. Wydajność

### Composite indexes

Kluczowe dla hot-path queries (patrz § 4.indeksy).

### Eager-loading

`routes/tasks.py::_eager_task_options()` — `selectinload` dla `assignees`, `comments`, `subtasks`, `tags`, `dependencies`, `dependent_links` + `joinedload` dla `project_record.members`. Zastosowane w `/tasks`, `/tasks/today`, `/tasks/blocked`, `/tasks/filter`, `/tasks/search`, `/tasks/by-project`, `/tasks/dependency-board`.

### Benchmark

Skrypty: `scripts/seed_perf.py` (5 zespołów × 1000 tasków × 5 komentarzy) + `scripts/perf_bench.py`. Cel: <100ms p95.

| Endpoint                        | p50  | p95  | p99  |
| ------------------------------- | ---- | ---- | ---- |
| `GET /tasks?page=1&per_page=50` | 25ms | 26ms | 51ms |
| `GET /tasks/today`              | 36ms | 40ms | 41ms |
| `GET /stats/dashboard`          | 31ms | 63ms | 63ms |
| `GET /tasks/blocked`            | 23ms | 24ms | 24ms |

### Skala

- **SQLite** (dev): do ~20 concurrent users na pojedynczą instancję.
- **PostgreSQL** (produkcja): obsługuje setki concurrent users.
- Dane: ~10MB DB dla 5 zespołów × 1000 tasków.
- Benchmark: `scripts/seed_perf.py` + `scripts/perf_bench.py`.
- Cel: <100ms p95 na list endpointach.

---

## 15. Testy

```bash
pytest                           # full suite
pytest tests/test_admin_endpoints.py -v
pytest -k "isolation"            # tylko isolation tests
```

### Stan

**220 passed, 1 skipped** na czystej bazie SQLite lub PostgreSQL.

### Struktura

```
tests/
├── conftest.py                          # fixtures: app, client, auth_client, user_client
├── test_basic.py                        # smoke testy
├── test_team_models.py                  # modele Team, TeamInvite, TeamAuditLog
├── test_user_team.py                    # User.team_id, session_version
├── test_auth_layer.py                   # before_request hook, decoratory
├── test_error_handler.py                # custom errors
├── test_missing_endpoints.py            # brakujące endpointy
├── test_migration_001.py                # backfill team_id
├── test_migration_002.py                # NOT NULL flip
├── test_tasks_team_scope.py             # routes/tasks per-team
├── test_projects_team_scope.py          # routes/projects per-team
├── test_nested_resources_scope.py       # comment/subtask/dep team_id
├── test_filters_notifications_scope.py  # filters, notifications, activity
├── test_invites.py                      # invite tokens, signup flow
├── test_socketio_scope.py               # per-team rooms
├── test_admin_endpoints.py              # super_admin endpointy
└── test_cross_team_isolation.py         # 30+ parametric isolation tests
```

---

## 16. Troubleshooting

### Frontend pokazuje "Not found" przy odświeżeniu

Backend musi rozpoznawać HTML navigation vs API fetch. `app.py::serve_spa` + `errorhandler(404)` zwracają `index.html` dla `Accept: text/html`. Jeśli to nie działa, sprawdź czy app.py został zaktualizowany i obraz przebudowany.

### Port 5000 zajęty (lokalny dev)

```bash
# Linux/macOS
lsof -i :5000
# Windows
netstat -ano | findstr :5000
```

### Docker build używa cache mimo zmian w kodzie

```bash
docker build --no-cache -t taskmaster2 .
```

### Socket.IO timeout

1. Sprawdź czy backend działa: `curl https://twoja-domena.up.railway.app/health`.
2. Sprawdź `CORS_ORIGINS` w Railway variables.
3. DevTools → Network → WS frame — upewnij sie ze polaczenie zostaje upgrade'owane do WebSocketa, nie zostaje na long-pollingu.
4. Railway edge przepuszcza upgrade headery automatycznie — jesli nie dziala, sprawdz wersje Flask-SocketIO i `SOCKETIO_ASYNC_MODE=gthread`.

### Migracja zawiesza się / błąd

```bash
# Lokalnie
flask db current
flask db downgrade -1
# Reset całkiem (LOSE DATA)
rm instance/tasks.db
flask db upgrade
```

### Email nie wysyla, request wisi

Patrz § 12 — wysylka jest asynchroniczna (`enqueue_email`), ale jesli widzisz `Failed to send email to ...: timed out` w logach Railway, sprawdz konfiguracje SMTP (server/port/credentials) oraz `MAIL_SUPPRESS_SEND` (musi byc `False` dla realnej wysylki).

### "Cross-team reference" 400 przy create task

Próbujesz przypisać assignee z innego zespołu. Sprawdź `assignee_ids` w body — wszyscy muszą mieć `team_id == g.current_team_id`.

### "Team archived" 403 przy logowaniu

Super-admin zarchiwizował zespół. Wymaga rozmowy z super-adminem o unarchive lub przeniesienie do innego zespołu.

### N+1 queries w nowym endpoint

Użyj `_eager_task_options()`:

```python
from routes.tasks import _eager_task_options  # albo zdefiniuj lokalnie

tasks = team_scoped(Task.query, Task).options(*_eager_task_options()).all()
```

---

## Pliki referencyjne

| Plik                           | Zawartość                                         |
| ------------------------------ | ------------------------------------------------- |
| [README.md](README.md)         | Krótki przegląd + quick start                     |
| [USER_GUIDE.md](USER_GUIDE.md) | Przewodnik dla końcowych użytkowników             |
| [AGENTS.md](AGENTS.md)         | Wytyczne dla AI agentów / nowych developerów      |
| [LICENSE](LICENSE)             | Licencja zastrzeżona                              |
| [AGENTS.md](AGENTS.md)         | Wytyczne dla AI agentów / nowych developerów      |
| [LICENSE](LICENSE)             | Licencja zastrzeżona                              |
| `.kiro/specs/team-workspaces/` | Spec multi-tenancy: requirements + design + tasks |

---

© 2026 Krzysztof Graczyk. Wszelkie prawa zastrzeżone.
