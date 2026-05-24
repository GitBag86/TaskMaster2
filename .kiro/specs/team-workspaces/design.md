# Design Document — team-workspaces

Status: draft for review
Requirements: [requirements.md](./requirements.md) (31 requirements approved)

## Overview

See [§1. Executive summary](#1-executive-summary) for a one-paragraph framing of the change. The rest of the document is structured around 19 topical sections plus 6 resolved decisions; the four sections required by the spec format map to the deeper material as follows:

- **Architecture** (next section) → expanded in [§2](#2-architecture-overview)
- **Components and Interfaces** → expanded in [§4 Authorization Layer](#4-authorization-layer), [§5 Socket.IO scoping](#5-socketio-scoping), [§7 Project templates](#7-project-templates), [§8 Invite tokens](#8-invite-tokens-i-self-signup), [§11 Frontend changes](#11-frontend-changes), [§12 New API endpoints](#12-nowe-endpointy-api)
- **Data Models** → expanded in [§3 Data model](#3-data-model)

## Architecture

High-level shape: every authenticated request flows through a `before_request` hook that resolves `g.current_team_id` and `g.current_role` from the session. Route handlers use `team_scoped(query, Model)` and `get_team_resource_or_404(Model, id)` helpers to enforce isolation transparently. Socket.IO uses per-team rooms (`team:{id}`) plus a dedicated `super_admin` room. Migration is split into two Alembic revisions to keep the dangerous DDL (NOT NULL, unique constraints) separate from data backfill. See [§2](#2-architecture-overview) for the diagram and full lifecycle.

## Components and Interfaces

Backend components introduced by this design:

| Component | File | Responsibility |
|---|---|---|
| `Authorization_Layer` | `utils/auth_layer.py` + `utils/auth_decorators.py` | `before_request` hook + `@require_role` decorators |
| `team_scoped(query, Model)` | `utils/scoping.py` | Adds `WHERE Model.team_id = g.current_team_id` to any query |
| `Team_Service` | `routes/admin.py` | Team CRUD, archival, manager assignment (super_admin only) |
| `Membership_Service` | `routes/admin.py` + `routes/invites.py` | Move users between teams, generate/consume invite tokens |
| `Template_Service` | `utils/template_service.py` | Seed per-team copies of catalogue templates on team create |
| `Realtime_Service` | extended `extensions.py` / connect handler | Per-team Socket.IO rooms |
| Error mapper | `utils/errors.py` + `app.errorhandler` | Convert `TaskMasterError` → JSON `{error, code}` + HTTP status |

Detailed interfaces, code snippets, and request/response shapes for each component live in §4 (Authorization), §5 (Socket.IO), §7 (Templates), §8 (Invites), §11 (Frontend), §12 (API endpoints), §13 (Error mapping).

## Data Models

Three new tables (`team`, `team_invite`, `team_audit_log`) and `team_id` FK added to 12 existing tables. Full ER diagram, column types, indexes, partial unique constraints, and the `CHECK` constraint on User are in [§3 Data model](#3-data-model). Migration strategy (one Alembic rev for schema+backfill, second rev for NOT NULL + constraints) is in [§6 Migration plan](#6-migration-plan).

## Correctness Properties

Invariants the design must preserve at all times:

### Property 1: Isolation invariant

For any two teams T1 ≠ T2 and any Team_Scoped_Resource R, a Manager or User of T1 must never see, mutate, or even learn the existence of R if R.team_id = T2. Enforcement: `before_request` + `team_scoped` + `get_team_resource_or_404` returning 404 (not 403) for cross-team probes.

**Validates: Requirements 9.1, 9.2, 9.3, 9.4, 31.1, 31.2**

### Property 2: Role-team consistency

`(role = 'super_admin' AND team_id IS NULL) OR (role IN ('manager', 'user') AND team_id IS NOT NULL)`. Enforced by DB-level `CHECK` constraint.

**Validates: Requirements 2.3, 2.4, 2.5, 2.6, 2.7**

### Property 3: Denormalized team_id consistency

For Comment, Subtask, TaskDependency, CustomField: `child.team_id = parent_task.team_id` always. Enforced at application layer (set on create) and verified by daily cron sanity check.

**Validates: Requirements 9.7, 12.1, 12.4**

### Property 4: Session freshness

A request whose `session['session_version']` differs from `user.session_version` is rejected with 401. Bumped on team move and team archival.

**Validates: Requirements 5.5, 7.7, 25.3**

### Property 5: Idempotent migration

Running the data backfill twice produces the same final state as running it once. Enforced by `WHERE team_id IS NULL` clauses on all UPDATE statements.

**Validates: Requirements 4.7, 31.5**

### Property 6: Cross-team dependency rejection

`task.team_id == depends_on_task.team_id` checked **before** cycle detection.

**Validates: Requirements 16.1, 16.2, 16.3**

### Property 7: Realtime room scope

Every Socket.IO emit includes `room=f'team:{resource.team_id}'`. No emit without an explicit room argument allowed.

**Validates: Requirements 22.1, 22.2, 22.3, 31.4**

### Property 8: Invite token single-use

A `TeamInvite` with non-NULL `consumed_at` cannot be reused. Enforced by transactional check + UPDATE on consume.

**Validates: Requirements 8.4, 8.6, 8.7, 8.8**

Test coverage of these properties is described in §14 and §17 of this document plus tasks 14 and 22 in `tasks.md`.

## Error Handling

See [§13 Error code mapping](#13-error-code-mapping-r30) for the full vocabulary and Python implementation. Key points:

- Five new application-level error codes (`team_archived`, `cross_team_reference`, `signup_disabled`, `invite_token_invalid`, `team_not_empty`) bind to specific HTTP statuses.
- Cross-team probes return **404, not 403**, to prevent enumeration leaks (R9.4).
- Frontend (`api/client.ts`) extracts `code` from error body and renders user-visible messages without auto-retry on `team_archived` / `signup_disabled` / `session_stale`.
- Unhandled exceptions in routes produce the existing 500 handler from `utils/logging_config.py` with full stack trace logged.

## Testing Strategy

Detailed in [§14 Testing strategy](#14-testing-strategy). Summary:

- **Fixtures**: `team_a`, `team_b`, `manager_a_client`, `user_a_client`, `manager_b_client`, `super_admin_client` — set up in `tests/conftest.py`.
- **Parametrized cross-team isolation tests**: ~30 (method, path) tuples × 2 cross-team scenarios = ~60 assertions of HTTP 404 (R31.1).
- **Migration round-trip tests**: legacy seed → apply 001 → apply 002 → verify all resources have `team_id = default.id`, super_admin has `team_id = NULL`.
- **Performance tests**: seed 5 teams × 1000 tasks each → `EXPLAIN ANALYZE` on top endpoints, target <100ms p95.
- **Smoke tests post-deploy**: super_admin creates 2 teams, promotes 2 managers, each invites 2 users; cross-team checks done from each browser.

## 1. Executive summary

TaskMaster2 dziś jest single-tenant. Wprowadzamy **Team Workspaces** — silną izolację per zespół + trzy-warstwową hierarchię ról (Super_Admin / Manager / User). Wszystkie zasoby zyskują `team_id`. Sesja niesie `(user_id, team_id, role)` i każdy request wpada przez wspólny `before_request` hook, który osadza `g.current_team_id` i `g.role`. Zapytania bazodanowe są filtrowane scope-helperem; Socket.IO ma per-team rooms. Migracja Alembica robi tworzenie `Default` team i bulk-assign wszystkiego w jednej rewizji, w drugiej rewizji flip-uje kolumny na NOT NULL.

Nowe modele: `Team`, `TeamInvite`, `TeamAuditLog`. Nowy enum ról: `super_admin` / `manager` / `user`. Stary string `role` jest reużywany (nie wprowadzamy enuma na poziomie DB, żeby uniknąć dodatkowej migracji typu — walidacja na poziomie Marshmallow).

## 2. Architecture overview

```
                    ┌──────────────────────────────────────────────────┐
                    │  Frontend SPA (React + Vite)                     │
                    │  AuthContext.currentTeam + role                  │
                    │  Routes: + /admin/teams (super_admin)            │
                    │          + /team/members (manager)               │
                    │          + /signup?token=...                     │
                    └────────────────────┬─────────────────────────────┘
                                         │ session cookie
                                         ▼
                    ┌──────────────────────────────────────────────────┐
                    │  Nginx (rate limiting, TLS) — bez zmian          │
                    └────────────────────┬─────────────────────────────┘
                                         │
                                         ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │  Flask app                                                          │
   │                                                                     │
   │  before_request:                                                    │
   │    - load user from session                                         │
   │    - if user.team and team.archived → 401 + clear session (R25.3)   │
   │    - g.current_team_id, g.current_role, g.current_user              │
   │                                                                     │
   │  ┌─────────────┐  ┌────────────────┐  ┌──────────────────────────┐  │
   │  │ @require_   │  │ @team_scope_   │  │ team_scoped(query)       │  │
   │  │  role(...)  │  │  required      │  │  -> query.filter(         │  │
   │  │             │  │  (404 if cross-│  │    Model.team_id ==       │  │
   │  │             │  │   team)        │  │    g.current_team_id)    │  │
   │  └─────────────┘  └────────────────┘  └──────────────────────────┘  │
   │                                                                     │
   │  routes/{auth,users,tasks,projects,filters,stats,notifications,     │
   │          teams,invites}.py                                          │
   │                                                                     │
   │  Realtime (Socket.IO):                                              │
   │    on_connect → join_room(f"team:{user.team_id}")                   │
   │                  if super_admin → join_room("super_admin")          │
   │    emit(..., room=f"team:{task.team_id}")                           │
   └────────────────────┬────────────────────────────────────────────────┘
                        │
                        ▼
                ┌──────────────────────────┐
                │  Postgres (Railway)      │
                │  + team_id FK na każdym  │
                │    Team_Scoped_Resource  │
                │  + indexes (team_id) i   │
                │    composite (team_id, X)│
                └──────────────────────────┘
```

## 3. Data model

### 3.1 Nowe tabele

#### `team`
```
id              SERIAL PK
name            VARCHAR(80)  UNIQUE NOT NULL    -- case-insensitive uniqueness via functional index
slug            VARCHAR(80)  UNIQUE NOT NULL    -- url-safe, derived
description     VARCHAR(500) DEFAULT ''
archived        BOOLEAN      NOT NULL DEFAULT false
created_by_id   INTEGER      FK -> user(id) NULL  -- NULL po deletion creatora
created_at      TIMESTAMP    DEFAULT now()

CREATE UNIQUE INDEX ix_team_name_lower ON team (LOWER(name)) WHERE archived = false;
CREATE INDEX ix_team_archived ON team (archived);
```

`slug` przyda się jeśli kiedyś pójdziemy w sub-paths, ale na MVP nie wystawiamy go w URLach (R24).

#### `team_invite`
```
id              SERIAL PK
team_id         INTEGER  FK -> team(id) ON DELETE CASCADE
token_hash      CHAR(64) UNIQUE NOT NULL        -- SHA256 (sam token tylko zwracany przy create)
created_by_id   INTEGER  FK -> user(id) NULL
created_at      TIMESTAMP DEFAULT now()
expires_at      TIMESTAMP NOT NULL              -- max created_at + 7 days (R8.6)
consumed_at     TIMESTAMP NULL                  -- set when used
consumed_by_id  INTEGER  FK -> user(id) NULL
default_role    VARCHAR(20) NOT NULL DEFAULT 'user'  -- 'user' lub 'manager'

CREATE INDEX ix_invite_team ON team_invite (team_id);
CREATE INDEX ix_invite_unconsumed ON team_invite (team_id) WHERE consumed_at IS NULL;
```

#### `team_audit_log`
```
id              SERIAL PK
actor_id        INTEGER FK -> user(id) NOT NULL  -- super_admin who acted
action          VARCHAR(50) NOT NULL              -- 'team.create', 'team.archive', 'user.move', 'manager.promote', etc.
target_team_id  INTEGER FK -> team(id) NULL
target_user_id  INTEGER FK -> user(id) NULL
source_team_id  INTEGER FK -> team(id) NULL       -- for moves
details         JSON                              -- extra context
created_at      TIMESTAMP DEFAULT now()

CREATE INDEX ix_audit_actor ON team_audit_log (actor_id, created_at DESC);
CREATE INDEX ix_audit_action_time ON team_audit_log (action, created_at DESC);
```

### 3.2 Zmiany istniejących tabel

Każda z niżej wymienionych tabel dostaje:
```
team_id  INTEGER  FK -> team(id) ON DELETE RESTRICT  NOT NULL
```
+ `CREATE INDEX ix_<tab>_team ON <tab> (team_id);`

| Tabela | Indeks dodatkowy (composite) |
|---|---|
| `user` | UNIQUE (team_id, username) — patrz 3.3 |
| `task` | (team_id, due_date), (team_id, status), (team_id, completed) |
| `project` | UNIQUE (team_id, LOWER(name)) zamiast globalnego UNIQUE name |
| `tag` | UNIQUE (team_id, LOWER(name)) |
| `saved_filter` | (team_id, user_id) |
| `task_template` | (team_id, user_id) |
| `recurring_task` | (team_id) |
| `notification` | (team_id, user_id, read) |
| `activity_log` | (team_id, created_at DESC) |
| `comment` | (team_id) — z backfill, ale w runtime filtrujemy przez task |
| `subtask` | (team_id) — analogicznie |
| `task_dependency` | (team_id) |
| `custom_field` | (team_id) |

**Decyzja:** denormalizujemy `team_id` aż na poziom Comment / Subtask / TaskDependency / CustomField. Argumenty:
- W przypadku Subtask/Comment robimy listę "ostatnia aktywność" sortowaną — dolaczanie `JOIN task` przy każdym filtrze zaboli na większych zbiorach.
- Authorization_Layer ma być prosty i wszędzie taki sam (`Model.team_id == g.current_team_id`), bez specjalnych ścieżek per-resource.
- Spójność wymuszamy w warstwie aplikacji — przy tworzeniu Comment/Subtask kopiujemy `team_id` z parent Task. Migracja backfill robi to samo SQLem (`UPDATE comment SET team_id = (SELECT team_id FROM task WHERE task.id = comment.task_id)`).

### 3.3 User model — zmiany

```python
class User(db.Model):
    # ... istniejące pola ...
    role = db.Column(db.String(20), default='user', nullable=False)  
    # walidacja na poziomie schemy: 'super_admin' | 'manager' | 'user'
    
    team_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=True)
    # NULL dopuszczalny TYLKO gdy role == 'super_admin' (R2.3)
    # CHECK constraint na poziomie DB:
    
__table_args__ = (
    db.CheckConstraint(
        "(role = 'super_admin' AND team_id IS NULL) OR "
        "(role IN ('manager','user') AND team_id IS NOT NULL)",
        name='ck_user_team_role_consistency'
    ),
    db.UniqueConstraint('team_id', 'username', name='uq_user_team_username'),
)
```

**Username unique scope:** dziś `username UNIQUE`. Robimy `UNIQUE (team_id, username)` żeby Anna z marketingu i Anna z drugiego zespołu mogły mieć ten sam login w obrębie swojego teamu. Wymaga to drobnej zmiany w `routes/auth.py::login` — szuka po username **i** team kontekście — ale ponieważ login jest "agnostic" (user wpisuje tylko username/password), zachowujemy się zachowawczo:

**Decyzja na MVP:** login w SIGNUP_MODE=invite_only nie potrzebuje multi-team disambig (zaproszenie jest w domyśle przed loginem). Zostawiamy `username UNIQUE GLOBAL` na pierwszą rewizję. To też ułatwia migrację (żaden user nie może mieć duplikatu po backfillu). Dopiero w przyszłej iteracji (jeśli się pojawi przypadek dwóch Ann) zmieniamy na composite.

### 3.4 Project model — zmiany

`name UNIQUE` -> `UNIQUE (team_id, LOWER(name))`. To znaczy że dwa zespoły mogą mieć każdy swój projekt "Marketing Q1". Migracja musi wykryć kolizje (mało prawdopodobne, bo dziś jest tylko 1 zespół Default po backfillu — żadnych kolizji nie będzie).

### 3.5 ER diagram (uproszczony)

```
       Team ─┬───────── User (team_id NULL allowed for super_admin)
             ├───────── Project ─── ProjectMembers ─── User
             ├───────── Task ───┬─── Comment
             │                  ├─── Subtask
             │                  ├─── TaskDependency
             │                  ├─── CustomField
             │                  └─── ActivityLog
             ├───────── Tag ─── TaskTags ─── Task
             ├───────── SavedFilter ─── User (owner)
             ├───────── TaskTemplate ─── User (owner)
             ├───────── RecurringTask ─── Task
             ├───────── Notification ─── User (recipient)
             └───────── TeamInvite ─── User (creator/consumer)

       TeamAuditLog ─── User (actor) ─── Team (target)
```

## 4. Authorization Layer

### 4.1 Session payload

Po loginie:
```python
session['user_id'] = user.id
session['team_id'] = user.team_id           # None dla super_admin
session['role'] = user.role                 # 'super_admin' | 'manager' | 'user'
session['session_version'] = user.session_version  # nowe pole na user; bump przy move/archive
```

`session_version` to pole na User table — `INTEGER NOT NULL DEFAULT 0`. Każde przeniesienie usera między zespołami albo archiwizacja jego teamu robi `user.session_version += 1`. Każdy request porównuje `session.get('session_version')` z aktualnym `user.session_version`; jeśli różnica → wyrzuć sesję, 401 (R7.7, R25.3).

### 4.2 `before_request` hook

Wstawiamy do `app.py::create_app` (po blueprintach, przed `register_request_logging`):

```python
def _register_auth_layer(app):
    PUBLIC_PATHS = {'/health', '/ready', '/version'}
    PUBLIC_PREFIXES = ('/auth/login', '/auth/signup', '/auth/logout')

    @app.before_request
    def _load_session_principal():
        path = request.path
        if path in PUBLIC_PATHS or path.startswith(PUBLIC_PREFIXES):
            return None

        user_id = session.get('user_id')
        if not user_id:
            return None  # @login_required dalej zwróci 401

        user = db.session.get(User, user_id)
        if user is None:
            session.clear()
            return jsonify({'error': 'Session invalid', 'code': 'session_invalid'}), 401

        if user.session_version != session.get('session_version'):
            session.clear()
            return jsonify({'error': 'Session stale', 'code': 'session_stale'}), 401

        if user.team_id is not None:
            team = db.session.get(Team, user.team_id)
            if team is None or team.archived:
                session.clear()
                return jsonify({'error': 'Team unavailable', 'code': 'team_archived'}), 403

        g.current_user = user
        g.current_team_id = user.team_id
        g.current_role = user.role
```

### 4.3 Decoratory autoryzacji

```python
# routes/auth.py

def require_role(*roles):
    """Wymaga zalogowania + jednej z wymienionych ról."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not g.get('current_user'):
                return jsonify({'error': 'Not authenticated'}), 401
            if g.current_role not in roles:
                return jsonify({'error': 'Forbidden'}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator

def require_team_member(fn):
    """Skrót: dowolna rola team-bound (manager lub user)."""
    return require_role('manager', 'user')(fn)

def require_super_admin(fn):
    return require_role('super_admin')(fn)

def require_manager_or_super(fn):
    return require_role('manager', 'super_admin')(fn)
```

Stary `@login_required` zostawiamy jako alias dla `@require_team_member` żeby nie przepisywać 100 routów na raz. Tam gdzie chcemy super_admin dostęp, zmieniamy ręcznie.

### 4.4 Helper `team_scoped`

```python
# utils/scoping.py

def team_scoped(query, model, *, team_id=None):
    """Dokleja filter po team_id z g.current_team_id (lub explicite podanym)."""
    tid = team_id if team_id is not None else g.get('current_team_id')
    if tid is None:
        # super_admin na zwykłym endpoincie -> pusty wynik (R9.6)
        return query.filter(False)
    return query.filter(model.team_id == tid)


def get_team_resource_or_404(model, resource_id):
    """Pobranie zasobu z auto-scope. Zwraca 404 jeśli cross-team (R9.4)."""
    obj = db.session.get(model, resource_id)
    if obj is None:
        return None
    if hasattr(obj, 'team_id') and obj.team_id != g.get('current_team_id'):
        return None
    return obj
```

Każde użycie `Task.query.filter_by(...)` zamieniamy na `team_scoped(Task.query, Task).filter_by(...)`. Każde `db.session.get(Task, id)` na `get_team_resource_or_404(Task, id)`.

Istniejące helpery `visible_task_query(user)`, `visible_projects_for_user(user)`, `assigned_task_query(user)` zostają — ale wewnętrznie zaczynają od `team_scoped(...)` i potem dolewają user-level filtr (np. `Task.assignees.any(...)` dla zwykłego usera). Manager widzi WSZYSTKIE taski w team_id (dziś admin widzi wszystkie globalnie — ten zakres się "kurczy", co jest pożądane).

### 4.5 Zmiany w role-checkach w `routes/tasks.py`

Dziś:
```python
if user.role != 'admin':
    return jsonify({"error": "Only admins can update tasks"}), 403
```

Po zmianie:
```python
if g.current_role not in ('manager', 'super_admin'):
    return jsonify({"error": "Tylko menedżer może edytować zadania"}), 403
```

Wszystkie miejsca z `user.role == 'admin'` → `g.current_role == 'manager'` (super_admin używa cross-team endpointów, nie wpada na zwykłe endpointy). Lista wystąpień:
- `routes/tasks.py` — ~12 miejsc (create, update, delete, bulk_*, dependencies, quick_add)
- `routes/users.py` — zarządzanie userami (delegujemy do nowych: `routes/teams.py` pełni rolę super-admin, manager używa `routes/team_members.py`)
- `routes/filters.py`, `routes/stats.py` — głównie odczyt, zmiana zakresu

## 5. Socket.IO scoping

```python
# w app.py albo w utils/realtime.py
from flask_socketio import join_room, leave_room
from flask import session

@socketio.on('connect')
def _on_connect(auth=None):
    user_id = session.get('user_id')
    if not user_id:
        return False  # rejekt connect
    user = db.session.get(User, user_id)
    if user is None:
        return False
    
    if user.role == 'super_admin':
        join_room('super_admin')
    elif user.team_id is not None:
        team = db.session.get(Team, user.team_id)
        if team is None or team.archived:
            return False
        join_room(f'team:{user.team_id}')
    else:
        return False  # zlamana niezmieniność, odrzuć
    
    return True

# emit: zamieniamy istniejące:
def emit_task_event(action, user, task=None, ..., extra=None):
    payload = {...}
    team_id = task.team_id if task else g.get('current_team_id')
    socketio.emit('task_action', payload, room=f'team:{team_id}')
```

Przy `move_user_between_teams`:
```python
# wymuszenie reconnect — leave room po stronie serwera nie zadziała bez SID,
# więc bumpujemy session_version, a klient po 401 i tak się reconnektuje.
# Dla super-pewności emitujemy 'force_reconnect' do user-specific room (per-SID po loginie).
```

W praktyce dla MVP wystarczy `session_version` mechanism — następny request usera wywala sesję i frontend re-zaloguje (R22.5).

## 6. Migration plan

### 6.1 Strategia

Robimy **dwie rewizje Alembica**:

**Rewizja `001_team_workspaces_schema`** (DDL + backfill, kolumny `team_id` jako NULL):
1. `CREATE TABLE team`, `team_invite`, `team_audit_log`.
2. Dodaj kolumny `team_id INTEGER NULL` do każdej z 12 tabel (Task, Project, Tag, ...).
3. Dodaj kolumny `session_version INTEGER NOT NULL DEFAULT 0` na `user`.
4. Backfill (data migration):
   - Sprawdź czy są jacyś userzy. Jeśli tak — utwórz `Team(name='Default')`.
   - Promote `DEFAULT_ADMIN_USERNAME` (jeśli istnieje) na `role='super_admin'`, `team_id=NULL`.
   - Pozostali userzy: `role='admin' → 'manager'`, `role='user' → 'user'`, wszyscy `team_id = default.id`.
   - Wszystkie Project, Task, Tag, SavedFilter, TaskTemplate, RecurringTask, Notification, ActivityLog, CustomField → `team_id = default.id`.
   - Comment, Subtask, TaskDependency → `team_id = (SELECT team_id FROM task WHERE id = ...)`.
   - Seed kopii project templates dla Default team z katalogu (sekcja 7).
5. Stwórz indeksy.

**Rewizja `002_team_workspaces_enforce`** (NOT NULL + constraints):
1. `ALTER COLUMN team_id SET NOT NULL` na wszystkich 12 tabelach.
2. Drop globalny `UNIQUE name` na `project`, dodaj `UNIQUE (team_id, LOWER(name))`.
3. Dodaj `CHECK` constraint na `user` (`ck_user_team_role_consistency`).
4. Drop globalne `UNIQUE name` na `tag`, dodaj `UNIQUE (team_id, LOWER(name))`.

Rozdzielenie pozwala safely zatrzymać się między 1 a 2 jeśli backfill znajdzie sieroty (R4.8) — po fixup re-run drugiej.

### 6.2 Idempotencja (R4.7)

Każdy krok backfillu poprzedzamy `IF NOT EXISTS`:
```python
default_team = session.execute(
    sa.select(team_table.c.id).where(team_table.c.name == 'Default')
).scalar_one_or_none()
if default_team is None:
    result = session.execute(team_table.insert().values(name='Default', slug='default'))
    default_team = result.inserted_primary_key[0]

# UPDATE ... WHERE team_id IS NULL → bezpieczne przy re-run
session.execute(
    task_table.update().values(team_id=default_team).where(task_table.c.team_id.is_(None))
)
```

### 6.3 Postgres + SQLite

Alembic obsługuje obie. Trick z `ALTER COLUMN` jest natywny w obu (SQLite od 3.35 obsługuje `ALTER TABLE ... DROP COLUMN`/`SET NOT NULL`, ale Alembic via `batch_alter_table` to ogarnia transparentnie).

`CHECK` constraints i partial unique indexes są pełnoprawne w Postgresie. W SQLite partial indexes działają, `LOWER(...)` w UNIQUE wymaga functional index — Alembic batch operations to obsługują.

**Konkret dla LOWER(name):**
```python
op.create_index(
    'uq_project_team_name_lower',
    'project',
    [sa.text('team_id'), sa.text('LOWER(name)')],
    unique=True
)
```

### 6.4 Sieroty (R4.8)

Przed `ALTER COLUMN ... NOT NULL` w rewizji 002 robimy assert:
```python
def _assert_no_orphans(connection):
    for table in ['task', 'project', 'tag', 'comment', 'subtask', ...]:
        count = connection.execute(
            sa.text(f"SELECT count(*) FROM {table} WHERE team_id IS NULL")
        ).scalar()
        if count > 0:
            raise RuntimeError(f"Migration aborted: {count} orphan rows in {table}")
```

Loguje nazwę tabeli, nie próbuje "domyślać się" — operator dostaje wyraźny sygnał (R29).

### 6.5 Rollback

`flask db downgrade` rewizji 002 → przywraca NULL-able. Downgrade rewizji 001 → drop kolumn `team_id`. Zachowujemy `team` tabelę (pusta = OK), żeby ułatwić re-upgrade. Wpisujemy w migracji warning że "any data created post-upgrade may be lost on downgrade" (R29.3).

## 7. Project templates

Dziś `routes/tasks.py` ma `PROJECT_TEMPLATES = {...}` (3 wpisy zaszyte w kodzie). Plus jest tabela `task_template` (pusta dziś).

### 7.1 Reorganizacja

```
utils/project_template_catalogue.py    # globalny readonly katalog (przeniesione z routes/tasks.py)
models.py:
    class ProjectTemplate(db.Model):    # NOWE — per-team kopie
        id, team_id, source_catalogue_key (varchar 50, NULL dla custom), name, description, color, payload (JSON)
```

`source_catalogue_key` to klucz `client_onboarding`/`release`/`campaign`. NULL = manager dodał własny. Pozwala kiedyś "zaktualizować kopię z katalogu" jeśli dodasz nowy szablon globalny.

### 7.2 Template_Service

```python
# utils/template_service.py
def seed_team_templates(team_id):
    """Tworzy per-team kopie wszystkich katalogowych szablonów."""
    for key, payload in PROJECT_TEMPLATE_CATALOGUE.items():
        existing = ProjectTemplate.query.filter_by(team_id=team_id, source_catalogue_key=key).first()
        if existing:
            continue
        db.session.add(ProjectTemplate(
            team_id=team_id,
            source_catalogue_key=key,
            name=payload['name'],
            description=payload['description'],
            color=payload['color'],
            payload={'tasks': payload['tasks']},
        ))
```

Wywoływane:
- W backfillu migracji dla Default team.
- W `routes/teams.py::create_team` po stworzeniu nowego.

### 7.3 Endpoint `GET /project-templates`

Zwraca per-team kopie z DB zamiast hardcoded słownika. Manager edytuje swoje, super_admin edytuje katalog (przez `/admin/template-catalogue` — opcjonalne na MVP, można odsunąć na pózniej).

## 8. Invite tokens i self-signup

### 8.1 Generacja (Manager only)

```
POST /team/invites
Body: {"role": "user" | "manager", "email": "ann@..."}    # email opcjonalnie
Response 201: {"token": "raw_token_only_returned_once", "expires_at": "...", "id": 42}
```

Logika:
1. `manager` only.
2. Wygeneruj `secrets.token_urlsafe(32)` → `raw_token`.
3. Zapisz `token_hash = sha256(raw_token).hexdigest()`, `team_id = g.current_team_id`, `created_by_id = user.id`, `expires_at = now() + 7 days`.
4. Jeśli email: wyślij e-mail z linkiem `https://app/signup?token={raw_token}`.
5. Response zwraca `raw_token` tylko raz — manager kopiuje, nie da się odzyskać.

### 8.2 Konsumpcja (publiczny endpoint)

```
POST /auth/signup
Body: {
  "username": "...",
  "password": "...",
  "email": "...",
  "accept_terms": true,
  "accept_privacy": true,
  "accept_marketing": false,
  "invite_token": "..."        # zależnie od SIGNUP_MODE
}
```

Flow:
```python
mode = current_app.config['SIGNUP_MODE']

if mode == 'disabled':
    return jsonify({'error': 'Signup disabled', 'code': 'signup_disabled'}), 403

if mode == 'invite_only':
    raw_token = data.get('invite_token')
    if not raw_token:
        return jsonify({'error': 'Invite token required', 'code': 'invite_token_invalid'}), 410
    invite = TeamInvite.query.filter_by(token_hash=sha256(raw_token).hexdigest()).first()
    if invite is None or invite.consumed_at or invite.expires_at < now():
        return jsonify({'error': 'Invalid invite', 'code': 'invite_token_invalid'}), 410
    if invite.team.archived:
        return jsonify({'error': 'Team archived', 'code': 'team_archived'}), 403
    target_team = invite.team
    target_role = invite.default_role
    invite.consumed_at = now()
    invite.consumed_by_id = ...  # po stworzeniu usera

elif mode == 'default_team':
    target_team = Team.query.filter_by(name='Default').first()
    if target_team is None or target_team.archived:
        return jsonify({'error': 'Signup unavailable'}), 503
    target_role = 'user'

# create user, link to target_team and role
```

### 8.3 Flow super_admin signup

Super_admin **nie używa** `/auth/signup`. Tworzony jest przez:
- bootstrap `_ensure_default_admin` przy pustej bazie (R3.4)
- migracja promote (R3.1)
- na MVP tylko jeden (R3.5) — endpoint do tworzenia kolejnych odpada

### 8.4 Frontend signup page

`AuthPage.tsx` rozszerzony o:
- detekcja query param `?token=...` → przedwypełnia pole `invite_token`, ukrywa je
- jeśli brak tokena i mode != default_team → pokazuje "Aby się zarejestrować, poproś menedżera o link"
- mode pobierany z `GET /auth/signup-info` (publiczny endpoint zwracający `{mode, team_name?}` — `team_name` tylko jeśli token jest w URL i ważny)

## 9. Mention resolver i Quick-Add — scoping

### 9.1 Mention resolver

`extract_mentions(text)` zostaje (czyste regex). Jego callsite w `routes/tasks.py::add_comment` zmieniamy:

```python
# było:
mentioned_usernames = extract_mentions(text)
mentioned_users = User.query.filter(User.username.in_(mentioned_usernames)).all()

# po:
mentioned_usernames = extract_mentions(text)
mentioned_users = User.query.filter(
    User.username.in_(mentioned_usernames),
    User.team_id == g.current_team_id  # R15.1
).all()
```

Niezresolwowane tokeny zostają literalnym tekstem w body komentarza (R15.2 — body i tak nie jest modyfikowane, zachowanie obecne).

### 9.2 Quick-Add parser

`parse_quick_task(text)` zwraca słownik z `assignee_names` (lista). Callsite w `quick_add_task` view:

```python
# było:
assignees = User.query.filter(User.username.in_(parsed["assignee_names"])).all()

# po:
assignees = User.query.filter(
    User.username.in_(parsed["assignee_names"]),
    User.team_id == g.current_team_id
).all()
```

`parsed["project"]` — `get_or_create_project` automatycznie scope'uje przez `team_id` (modyfikacja w sekcji 4.4).

Nieresolwowany `@token` zostaje literalnym tekstem w title (R14.3 — bo `parse_quick_task` filtruje tokeny ze znakiem `@`, ale my jak nie znajdziemy User'a z `username==assignee_names[0]`, to po prostu tasku nie przypiszemy nikomu — title już zawiera tekst bez `@`, więc trzeba zmienić logic: jeśli użytkownik nieznaleziony, zachowujemy literal token w title). Drobna refaktoryzacja w `parse_quick_task`.

## 10. Dependency validator — cross-team

`would_create_dependency_cycle(task_id, depends_on_task_id)` rozszerzamy o pre-check:

```python
def validate_new_dependency(task_id, depends_on_task_id):
    task = db.session.get(Task, task_id)
    other = db.session.get(Task, depends_on_task_id)
    if task is None or other is None:
        return ('not_found', 404)
    if task.team_id != other.team_id:
        return ('cross_team_reference', 400)         # R16.2 – BEFORE cycle check (R16.3)
    if task.id == other.id:
        return ('self_dependency', 400)
    if would_create_dependency_cycle(task.id, other.id):
        return ('cycle', 409)
    return None  # ok
```

Refaktoryzacja w endpoincie `/tasks/<id>/dependencies` POST.

## 11. Frontend changes

### 11.1 types/index.ts

```typescript
export type Role = 'super_admin' | 'manager' | 'user';

export interface User {
  id: number;
  username: string;
  email: string;
  role: Role;
  team_id: number | null;     // null tylko dla super_admin
  team?: Team;                 // expand z backendu
  // ... istniejące pola
}

export interface Team {
  id: number;
  name: string;
  slug: string;
  description: string;
  archived: boolean;
  created_at: string;
}

export interface InviteToken {
  id: number;
  expires_at: string;
  consumed_at: string | null;
  default_role: 'user' | 'manager';
  raw_token?: string;          // tylko w POST response
}
```

### 11.2 AuthContext

Dodajemy `currentTeam: Team | null`. Backend `/auth/me` zwraca rozszerzony payload.

### 11.3 api/client.ts — nowe namespacy

```typescript
api.teams = {
  list: () => request<{teams: Team[]}>('/admin/teams'),                  // super_admin only
  create: (data) => request<Team>('/admin/teams', { method: 'POST', body }),
  update: (id, data) => request<Team>(`/admin/teams/${id}`, { method: 'PUT', body }),
  archive: (id) => request<void>(`/admin/teams/${id}/archive`, { method: 'POST' }),
  delete: (id) => request<void>(`/admin/teams/${id}`, { method: 'DELETE' }),
  members: (id) => request<{users: User[]}>(`/admin/teams/${id}/members`),
  moveUser: (userId, toTeamId) => request<void>(`/admin/users/${userId}/team`, { 
    method: 'POST', body: { team_id: toTeamId } 
  }),
  promote: (userId, role) => request<void>(`/admin/users/${userId}/role`, { 
    method: 'POST', body: { role } 
  }),
};

api.invites = {
  list: () => request<{invites: InviteToken[]}>('/team/invites'),        // manager only
  create: (data) => request<InviteToken>('/team/invites', { method: 'POST', body }),
  revoke: (id) => request<void>(`/team/invites/${id}`, { method: 'DELETE' }),
};

api.signup = {
  info: (token?) => request<{mode, team_name?}>(`/auth/signup-info${token ? `?token=${token}` : ''}`),
};
```

### 11.4 Nowe komponenty

```
frontend/src/components/Admin/
  TeamsAdminPage.tsx           # super_admin only — lista zespołów, CRUD
  TeamDetailPage.tsx           # super_admin only — członkowie, audit log

frontend/src/components/Team/
  TeamMembersPage.tsx          # manager — członkowie zespołu, lista zaproszeń
  InviteForm.tsx               # generowanie nowego invite

frontend/src/components/Auth/
  SignupPage.tsx (zmiana)      # czyta ?token= z URL, wywołuje /auth/signup-info
```

Routing w App.tsx:
```tsx
<Route path="admin/teams" element={<RoleRoute roles={['super_admin']}><TeamsAdminPage /></RoleRoute>} />
<Route path="admin/teams/:id" element={<RoleRoute roles={['super_admin']}><TeamDetailPage /></RoleRoute>} />
<Route path="team/members" element={<RoleRoute roles={['manager']}><TeamMembersPage /></RoleRoute>} />
```

Komponent `RoleRoute`:
```tsx
function RoleRoute({roles, children}) {
  const {user} = useAuth();
  if (!user || !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

### 11.5 Layout / sidebar

`DashboardLayout.tsx` warunkowo:
- super_admin: sidebar pokazuje tylko "Zespoły", "Audyt", brak personal task views
- manager: standardowy sidebar + dodatkowo "Członkowie zespołu", "Zaproszenia"
- user: jak dziś (bez "Admin")

## 12. Nowe endpointy API

### 12.1 Super_admin

| Method | Path | Body | Response | Errors |
|---|---|---|---|---|
| GET | `/admin/teams` | - | `{teams: Team[]}` | 403 |
| POST | `/admin/teams` | `{name, description?}` | `Team` | 400 (uniqueness), 403 |
| PUT | `/admin/teams/{id}` | `{name?, description?}` | `Team` | 400, 403, 404 |
| POST | `/admin/teams/{id}/archive` | - | `Team` | 403, 404 |
| DELETE | `/admin/teams/{id}` | - | 204 | 403, 404, 409 (`team_not_empty`) |
| GET | `/admin/teams/{id}/members` | - | `{users: User[]}` | 403, 404 |
| GET | `/admin/teams/{id}/audit` | - | `{entries: TeamAuditLog[]}` | 403, 404 |
| POST | `/admin/users/{id}/team` | `{team_id}` | `User` | 400, 403, 404 |
| POST | `/admin/users/{id}/role` | `{role}` | `User` | 400, 403, 404 |
| GET | `/admin/audit` | `?limit=` | `{entries: ...}` | 403 |
| GET | `/admin/stats` | - | `{teams: [{team, stats}], aggregate}` | 403 |

### 12.2 Manager (team-scope)

| Method | Path | Body | Response | Errors |
|---|---|---|---|---|
| GET | `/team` | - | `Team` (current user's team) | 401 |
| GET | `/team/invites` | - | `{invites: InviteToken[]}` | 403 |
| POST | `/team/invites` | `{role, email?}` | `{token, expires_at, id}` | 400, 403 |
| DELETE | `/team/invites/{id}` | - | 204 | 403, 404 |

`/team/members` to istniejący `/users` (po naszej zmianie zwraca tylko team members manager'a).

### 12.3 Public

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/auth/signup-info?token=...` | - | `{mode, team_name?}` |

`/auth/signup` — istnieje, rozszerzony o `invite_token` field.

## 13. Error code mapping (R30)

```python
# utils/errors.py
class TaskMasterError(Exception):
    code: str = 'unknown'
    http_status: int = 500
    message: str = 'Unknown error'

class TeamArchivedError(TaskMasterError):
    code = 'team_archived'
    http_status = 403

class CrossTeamReferenceError(TaskMasterError):
    code = 'cross_team_reference'
    http_status = 400

class SignupDisabledError(TaskMasterError):
    code = 'signup_disabled'
    http_status = 403

class InviteTokenInvalidError(TaskMasterError):
    code = 'invite_token_invalid'
    http_status = 410

class TeamNotEmptyError(TaskMasterError):
    code = 'team_not_empty'
    http_status = 409

# error handler in app.py
@app.errorhandler(TaskMasterError)
def _handle_app_error(exc):
    return jsonify({'error': exc.message, 'code': exc.code}), exc.http_status
```

Frontend handler w `api/client.ts` ekstraktuje `code` jeśli jest:
```typescript
if (errorBody?.code === 'team_archived') {
  // pokaż konkretny komunikat, bez retry (R27.4)
}
```

## 14. Testing strategy

### 14.1 Nowe fixtures w `tests/conftest.py`

```python
@pytest.fixture
def team_a(app):
    with app.app_context():
        team = Team(name='Team A', slug='team-a')
        db.session.add(team); db.session.commit()
        yield team

@pytest.fixture  
def team_b(app):
    with app.app_context():
        team = Team(name='Team B', slug='team-b')
        db.session.add(team); db.session.commit()
        yield team

@pytest.fixture
def super_admin_client(client, app):
    with app.app_context():
        admin = User(username='super', email='super@x', role='super_admin', team_id=None, session_version=0)
        admin.set_password('p'); db.session.add(admin); db.session.commit()
        with client.session_transaction() as sess:
            sess['user_id'] = admin.id; sess['role'] = 'super_admin'; sess['session_version'] = 0
    return client

@pytest.fixture
def manager_a_client(client, app, team_a):
    # ... analogicznie z role='manager', team_id=team_a.id
    
@pytest.fixture
def user_a_client(client, app, team_a):
    # ... role='user', team_id=team_a.id

# i tak samo dla team_b
```

### 14.2 Parametrized cross-team test

```python
TEAM_SCOPED_RESOURCES = [
    ('GET', '/tasks'),
    ('GET', '/tasks/{id}'),
    ('PUT', '/tasks/{id}'),
    ('DELETE', '/tasks/{id}'),
    ('GET', '/projects'),
    # ... 30+ endpointów
]

@pytest.mark.parametrize('method,path_tpl', TEAM_SCOPED_RESOURCES)
def test_cross_team_returns_404(manager_b_client, team_a_resource, method, path_tpl):
    """R31.1: każdy endpoint zwraca 404 dla zasobu z innego teamu."""
    response = manager_b_client.open(method=method, path=path_tpl.format(id=team_a_resource.id))
    assert response.status_code == 404
```

### 14.3 Migration round-trip test

```python
def test_migration_round_trip(empty_db_with_legacy_seed):
    """R31.5: po migracji każdy zasób ma team_id == default_team.id."""
    apply_migration_001()
    apply_migration_002()
    
    default = Team.query.filter_by(name='Default').one()
    for model in [Task, Project, Tag, Comment, Subtask, ...]:
        rows = db.session.query(model).all()
        assert all(r.team_id == default.id for r in rows)
    
    # Super_admin nie ma team_id
    super = User.query.filter_by(role='super_admin').one()
    assert super.team_id is None
```

### 14.4 Coverage matrix

Dla każdej zmiany w existing routes (np. `routes/tasks.py::create_task`) — zachowujemy istniejące testy + dodajemy:
- happy path (manager_a tworzy w team_a)
- forbidden (user_a tworzy → 403)
- forbidden cross-team (manager_b nie widzi team_a)
- super_admin na zwykłym endpoincie → 200 z pustą listą / 404 (R9.6)

## 15. Performance

### 15.1 Indexy do dodania w migracji

Każda kolumna `team_id` → b-tree index. Dodatkowo:
```sql
CREATE INDEX ix_task_team_due ON task (team_id, due_date) WHERE completed = false;
CREATE INDEX ix_task_team_status ON task (team_id, status);
CREATE INDEX ix_notification_team_user_unread ON notification (team_id, user_id) WHERE read = false;
CREATE INDEX ix_activity_team_created ON activity_log (team_id, created_at DESC);
```

Partial indexes (Postgres) drastycznie zmniejszają overhead na dashboard query (otwarte taski po terminie itp.).

### 15.2 Query plan check

Przed merge robimy `EXPLAIN ANALYZE` na top-3 endpointach (`/tasks?page=1`, `/stats/dashboard`, `/tasks/today`) na sztucznie zalanej bazie ~10k rows / 5 teams. Cel: <100ms.

### 15.3 Brak N+1

`team_scoped(query, Model)` dodaje WHERE — nie wprowadza joinów. Istniejące `joinedload` / `subquery` zostają.

## 16. Rollout plan

User ma ~3 użytkowników aktywnych. **Single deploy z migracją w start.sh** jest akceptowalny:

1. Push do main → Railway buduje image.
2. `start.sh` robi `flask db upgrade` przed Gunicornem (już dziś tak działa).
3. Migracja 001 + 002 przebiega w jednej transakcji (Postgres). User może zauważyć ~30s "starting" (cold start + migracja na małym DB <5s).
4. Po starcie super_admin (bootstrapowy `admin`) loguje się, widzi siebie poza zespołem.
5. Manager (Lucyna) zostaje promowana z User → Manager przez super_admina przez UI lub bezpośredni SQL hotfix:
   ```sql
   UPDATE "user" SET role = 'manager' WHERE username = 'lucyna';
   UPDATE "user" SET session_version = session_version + 1 WHERE username = 'lucyna';
   ```
6. Lucyna re-loguje, dostaje Manager view.
7. Super_admin tworzy nowy Team "Marketing-Lucyna" (lub przemianowuje Default), tworzy "Operations-Agnieszka", przenosi userów między zespołami przez UI.

### Feature flag — czy potrzebny?

Wątpię. Gdyby coś poszło nie tak, `flask db downgrade` cofa do single-tenant. Frontend musi być deployed razem z backendem (atomic) — to standard.

**Mitigacja ryzyka:** robię backup Postgresa na Railway (`pg_dump`) przed `db upgrade`. To 10s pracy operatora i zerowy koszt.

## 17. Audit log (R26)

Każda akcja super_admina (create_team, archive, rename, delete, move_user, promote, demote, generate_invite_for_team) wywołuje:
```python
db.session.add(TeamAuditLog(
    actor_id=g.current_user.id,
    action='team.archive',
    target_team_id=team.id,
    details={'old_name': old, 'new_name': team.name},
))
```

Endpoint `/admin/audit` i `/admin/teams/{id}/audit` zwracają wpisy. **Niedostępne dla managerów / userów** (R26.3).

## 18. Risks i open questions

| Risk | Mitigation |
|---|---|
| Backfill zostawia sieroty (np. `comment` bez `task`) | Pre-check w migracji 002, abort z exit != 0 (R4.8, R29) |
| Super_admin przez pomyłkę wyloguje samego siebie (np. po archiwizacji wszystkich zespołów) | Niemożliwe — super_admin nie ma `team_id`, archive nie wpływa |
| Ktoś już wpisał "Default" jako team — migracja kolizji | UNIQUE LOWER(name) WHERE archived=false, idempotentność (R4.7) |
| Sesje istniejących userów po deployu z legacy `role` | Migracja bumpuje `session_version` na każdym userze → wszyscy re-loginują |
| Drift między Comment.team_id i Task.team_id | Triggerów nie dodajemy; w warstwie aplikacji set team_id z task przy create. Cron job sanity-check raz na dobę: `SELECT count(*) FROM comment c JOIN task t ON c.task_id=t.id WHERE c.team_id != t.team_id` — alarm w logu |
| Performance regression na większych team-ach | Sekcja 15 — composite indexes |
| Project templates — jeśli Super_admin doda nowy do katalogu, czy auto-seed do istniejących team-ów? | **Open**: na MVP nie — manager musi explicite "import from catalogue". Nie dotykamy tego MVP |
| Manager generuje invite z rolą `manager` — czy ograniczamy? | Manager może promować do managera w swoim teamie (R7.1 mówi "add User" — ale Requirement 6 mówi że promote/demote tylko super_admin). **Decyzja designu**: manager generuje invite **tylko z rolą 'user'**, promote do manager wymaga super_admin (zgodne z R6.1, R6.4). Schema będzie tego pilnować |

### Resolved decisions (potwierdzone przez użytkownika)

1. **Super_admin landing** — po loginie redirect na `/admin/teams`. Brak personal task views. Sidebar dla super_admin pokazuje tylko zarządzanie zespołami i audit.
2. **`/auth/me` payload** — `team` zwracany jako expanded Team object (`{id, name, slug, archived, ...}`), nie tylko `team_id`.
3. **Audit log retention** — bez retencji na MVP. Job czyszczący entries > 1 rok wprowadzimy w przyszłej iteracji jeśli lista urośnie.
4. **Username uniqueness** — `UNIQUE` globalnie zostaje. Composite `UNIQUE (team_id, username)` odsuwamy na przyszłość.
5. **Manager-generowane invite tokens** — manager może wystawiać invite **tylko z rolą `user`**. Promote do manager wymaga super_admina (zgodne z R6.4). Walidacja: `TeamInvite.default_role IN ('user')` przy tworzeniu przez managera. `routes/teams.py` dla super_admin może wystawić z `default_role='manager'`.
6. **`/tasks/by-project` endpoint** — w api/client.ts ale nie ma go w routes. Pomijamy w pracach.

## 19. Definition of Done

- [ ] Wszystkie 31 wymagań mają pokrycie w kodzie + teście.
- [ ] Migracja 001 + 002 przeszła na świeżej bazie i na kopii produkcyjnej (test staging).
- [ ] `pytest` zielony, w tym parametrized cross-team isolation tests dla wszystkich Team_Scoped_Resource.
- [ ] Manual smoke test: super_admin → tworzy 2 zespoły, promuje 2 managerki, każda zaprasza po 2 userów. Userzy nie widzą siebie cross-team.
- [ ] Performance baseline: `/tasks?page=1` i `/stats/dashboard` <100ms p95 na seed 1000 tasków × 2 zespoły.
- [ ] Frontend: brak warningów w konsoli, build przechodzi.
- [ ] Documentation: README zaktualizowany o trzy role, AGENTS.md o nowych helperach (`team_scoped`, `require_role`).

---

## Decyzje pominięte celowo (out-of-scope MVP)

- Multi-team membership per user (R confirmation: jeden user = jeden zespół)
- Team-level customization (logo, kolor, lokalizacja czasowa)
- Cross-team task migration UI (super_admin moves zostaje SQL/API only)
- API versioning (R27.3 — nie wprowadzamy)
- Email per-team templates (R21 — wystarczy że nie leakuje cross-team)
- SSO / OAuth — bez zmian, session-based zostaje
