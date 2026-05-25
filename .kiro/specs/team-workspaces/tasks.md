# Implementation Plan — team-workspaces

## Overview

Wprowadzenie multi-tenancy (Team Workspaces) do TaskMaster2 — pełna izolacja zespołów, trzy poziomy ról (super_admin / manager / user), migracja istniejących danych do "Default" team, invite tokens dla self-signup. Pracujemy na żywej produkcji na Railway, więc każdy etap kończy się stabilnym checkpointem.

Spec: [requirements.md](./requirements.md) (31 requirements) + [design.md](./design.md) (19 sections + 6 resolved decisions).

Estymacja: ~8.5 dnia roboczego, +30% rezerwy = ~11 dni.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "name": "Fundament",
      "tasks": [1, 2, 3, 4],
      "depends_on": []
    },
    {
      "wave": 2,
      "name": "Migracja",
      "tasks": [5, 6, 7],
      "depends_on": [1, 2, 3, 4]
    },
    {
      "wave": 3,
      "name": "Backend scope per resource",
      "tasks": [8, 9, 10, 11, 12, 13],
      "depends_on": [5, 6, 7]
    },
    {
      "wave": 4,
      "name": "Cross-team isolation tests",
      "tasks": [14],
      "depends_on": [8, 9, 10, 11, 12, 13]
    },
    {
      "wave": 5,
      "name": "Frontend",
      "tasks": [15, 16, 17, 18, 19],
      "depends_on": [14]
    },
    {
      "wave": 6,
      "name": "Polish & rollout",
      "tasks": [20, 21, 22],
      "depends_on": [15, 16, 17, 18, 19]
    }
  ]
}
```

## Tasks

- [x] 1. Konfiguracja i error vocabulary
  - Dodaj do `config.py` zmienne: `SIGNUP_MODE` (default `invite_only`), `INVITE_TOKEN_TTL_DAYS` (default 7), `SUPER_ADMIN_LANDING` (default `/admin/teams`).
  - Stwórz `utils/errors.py` z bazową `TaskMasterError` i klasami: `TeamArchivedError` (403, `team_archived`), `CrossTeamReferenceError` (400, `cross_team_reference`), `SignupDisabledError` (403, `signup_disabled`), `InviteTokenInvalidError` (410, `invite_token_invalid`), `TeamNotEmptyError` (409, `team_not_empty`).
  - W `app.py::create_app` zarejestruj `@app.errorhandler(TaskMasterError)` zwracający `{"error": exc.message, "code": exc.code}` z `exc.http_status`.
  - Dodaj wpis `SIGNUP_MODE=invite_only` do `.env.example`.
  - Test: `tests/test_error_handler.py` — rzuć `TeamArchivedError` ze stub-route, sprawdź HTTP 403 i `code: team_archived` w JSON.
  - Done: `pytest` zielony, error handler odpowiada zgodnie ze specem.
  - _Refs: R30, design 13_

- [x] 2. Model Team + TeamInvite + TeamAuditLog
  - W `models.py` dodaj klasy `Team` (id, name, slug, description, archived, created_by_id, created_at), `TeamInvite` (token_hash CHAR 64, expires_at, consumed_at, consumed_by_id, default_role, team_id, created_by_id), `TeamAuditLog` (actor_id, action, target_team_id, target_user_id, source_team_id, details JSON, created_at).
  - Dodaj metody: `Team.to_dict(include_stats=False)`, `TeamInvite.is_active()`, `TeamAuditLog.to_dict()`.
  - Wygeneruj migrację Alembica: `flask db migrate -m "add team, team_invite, team_audit_log tables"`.
  - Ręcznie dodaj indeksy z design 3.1: `ix_team_name_lower` (UNIQUE, partial WHERE archived=false), `ix_team_archived`, `ix_invite_team`, `ix_invite_unconsumed` (partial WHERE consumed_at IS NULL), `ix_audit_actor`, `ix_audit_action_time`.
  - `flask db upgrade`.
  - Test: `tests/test_team_models.py` — utwórz Team, TeamInvite, TeamAuditLog, sprawdź serializację.
  - Done: migracja przechodzi na pustej bazie SQLite + Postgres lokalnym.
  - _Refs: R1, R8, R26, design 3.1_

- [x] 3. User model — team_id, session_version, nowe role
  - W `models.py::User` dodaj kolumny: `team_id INTEGER FK -> team(id) NULL`, `session_version INTEGER NOT NULL DEFAULT 0`.
  - Dodaj relację: `team = db.relationship('Team', backref='members', foreign_keys=[team_id])`.
  - Update `User.to_dict()` żeby zwracało `team_id` i opcjonalnie expanded `team` (przy `expand_team=True`, dla `/auth/me`).
  - W `schemas.py` zwaliduj `role in ('super_admin', 'manager', 'user')`.
  - Dodaj metody: `User.is_super_admin()`, `User.is_manager()`, `User.is_team_member()`.
  - Wygeneruj rewizję: `flask db migrate -m "user team_id and session_version"`. `flask db upgrade`.
  - Test: `tests/test_user_team.py` — User bez team_id (super_admin), z team_id (manager/user), bump session_version.
  - Done: istniejący `pytest` zielony, możliwe utworzenie usera w 3 wariantach.
  - _Refs: R2, R3, R7.7, design 3.3, 4.1_

- [x] 4. Authorization Layer — decoratory + helpery
  - Stwórz `utils/scoping.py` z `team_scoped(query, model, *, team_id=None)` i `get_team_resource_or_404(model, resource_id)` zgodnie z design 4.4.
  - Stwórz dekoratory w `utils/auth_decorators.py`: `require_role(*roles)`, `require_team_member`, `require_super_admin`, `require_manager_or_super`.
  - Zachowaj `login_required` jako alias `require_team_member` (kompatybilność z istniejącymi routami).
  - Stwórz `utils/auth_layer.py::register_auth_layer(app)` z `before_request` hookiem (design 4.2): public paths whitelist, ładowanie usera, sprawdzanie session_version, archived team → 403.
  - Wywołaj `register_auth_layer(app)` w `create_app` (po blueprintach).
  - W `routes/auth.py::login` zapisz `session['team_id']`, `session['role']`, `session['session_version']` po sukcesie.
  - W `routes/auth.py::logout` clearuj wszystkie 4 klucze atomowo.
  - Test: `tests/test_auth_layer.py` — niezalogowany /health=200, /tasks=401, archived team→403 z kodem, stale session_version→401 z kodem.
  - Done: dekoratory dostępne, before_request nie psuje istniejących testów.
  - _Refs: R9, R25, design 4_

- [x] 5. Project template catalogue + ProjectTemplate model
  - Stwórz `utils/project_template_catalogue.py`, przenieś `PROJECT_TEMPLATES` z `routes/tasks.py` jako `PROJECT_TEMPLATE_CATALOGUE`.
  - W `routes/tasks.py` zaimportuj z catalogue, usuń lokalną kopię.
  - W `models.py` dodaj `ProjectTemplate(id, team_id FK, source_catalogue_key, name, description, color, payload JSON, created_by_id, created_at, updated_at)`.
  - Stwórz `utils/template_service.py::seed_team_templates(team_id)` zgodnie z design 7.2.
  - Wygeneruj migrację dla `project_template`. Tabela startuje pusta — Task 6 wypełni.
  - Test: unit test `seed_team_templates(team.id)` wstawia 3 wpisy z `source_catalogue_key in {client_onboarding, release, campaign}`. Istniejące testy `/project-templates/*` zielone.
  - Done: seed_team_templates działa, stara logika /project-templates/{key}/use nadal używa katalogu (refaktor endpointu w Task 9).
  - _Refs: R17, design 7_

- [x] 6. Migracja 001 — schema + backfill
  - Wygeneruj nową rewizję: `flask db migrate -m "team_workspaces schema and backfill"`.
  - Edytuj plik ręcznie (auto-generate nie pokryje data migration).
  - Schema: dodaj `team_id INTEGER FK -> team(id) NULL` na 12 tabelach (task, project, tag, saved_filter, task_template, recurring_task, notification, activity_log, comment, subtask, task_dependency, custom_field). Dodaj zwykłe `ix_<tab>_team` indexy.
  - Data migration w `upgrade()` po DDL, w jednej transakcji:
    1. Idempotent INSERT Team(name='Default', slug='default').
    2. Promote: `UPDATE user SET role='super_admin', team_id=NULL WHERE username = '<DEFAULT_ADMIN_USERNAME from env>'`.
    3. `UPDATE user SET role='manager', team_id=<default_id> WHERE role='admin'` (pozostali).
    4. `UPDATE user SET role='user', team_id=<default_id> WHERE team_id IS NULL`.
    5. UPDATE 9 root tabel SET team_id=default WHERE team_id IS NULL.
    6. UPDATE comment/subtask/task_dependency SET team_id = (SELECT team_id FROM task WHERE task.id = X.task_id).
    7. Bump session_version: `UPDATE user SET session_version = session_version + 1`.
    8. Seed templates dla Default team: insert z catalogue (3 wpisy).
  - Idempotencja: każdy UPDATE z `WHERE team_id IS NULL`, INSERT z ON CONFLICT DO NOTHING / INSERT OR IGNORE.
  - `downgrade()`: drop FK, drop columns, drop indexy. Tabele team/team_invite/team_audit_log zostają.
  - Test: `tests/test_migration_001.py` — legacy seed (3 userów, 1 project, 5 tasków, comments) → apply → asserty na team_id i role. Re-run idempotentny.
  - Done: migration test zielony, ręczny test na pg_dump produkcji.
  - _Refs: R3, R4, R29, design 6_

- [x] 7. Migracja 002 — flip do NOT NULL + constraints
  - Nowa rewizja: `flask db migrate -m "team_workspaces enforce non-null"`.
  - W `upgrade()`:
    1. Pre-check sierot: dla każdej tabeli `SELECT count(*) WHERE team_id IS NULL`. Jeśli > 0 → raise z nazwą tabeli + count.
    2. `ALTER COLUMN team_id SET NOT NULL` na 12 tabelach (use `batch_alter_table` dla SQLite).
    3. Drop globalnego `UNIQUE name` z `project`, dodaj `UNIQUE (team_id, LOWER(name)) WHERE archived=false` (raw SQL dla functional partial index).
    4. Drop globalnego `UNIQUE name` z `tag`, dodaj `UNIQUE (team_id, LOWER(name))`.
    5. Add `CHECK` constraint na User: `ck_user_team_role_consistency`.
    6. Composite indexy z design 15.1: `ix_task_team_due` (partial WHERE completed=false), `ix_task_team_status`, `ix_notification_team_user_unread`, `ix_activity_team_created`.
  - `downgrade()`: reverse — drop constraints/indexes, set columns nullable, restore globalne UNIQUE.
  - Test: `tests/test_migration_002.py` — apply 001+002 na świeżej bazie → próba INSERT user role=manager bez team_id → IntegrityError. Idempotencja 001+002.
  - Done: obie migracje przechodzą na czystej bazie + na pg_dump produkcji.
  - _Refs: R3.5, R4.7, R4.8, R29, design 6_

- [x] 8. Tasks routes — team scope
  - W `routes/tasks.py` zamień `Task.query` → `team_scoped(Task.query, Task)` we wszystkich list endpointach (get_tasks, today, blocked, dependency_board, search, filter).
  - Zamień `db.session.get(Task, id)` → `get_team_resource_or_404(Task, id)` w endpointach single-resource.
  - Zamień `if user.role != 'admin'` → `if g.current_role not in ('manager', 'super_admin')`.
  - W `create_task` ustaw `task.team_id = g.current_team_id` przed `db.session.add`.
  - W `quick_add_task` zaktualizuj filter assignees po `team_id = g.current_team_id` (design 9.2). Niezresolwowany token `@x` zostaje literal w title.
  - W `add_comment` mention resolver scoped do team (design 9.1). Set `comment.team_id = task.team_id`.
  - W `manage_task_dependencies POST` zastosuj `validate_new_dependency` (design 10) **przed** cycle check.
  - Update `assigned_task_query`, `visible_task_query`, `visible_projects_for_user`, `get_or_create_project` żeby zaczynały od `team_scoped`.
  - W bulk endpoints (complete/delete/update) waliduj każdy task przez `get_team_resource_or_404`. Cross-team task w body → odrzuć całą operację z `cross_team_reference`.
  - W `emit_task_event` dodaj `room=f'team:{task.team_id}'` (przygotowanie pod Task 13).
  - Test: `tests/test_tasks_team_scope.py` — manager A tworzy task (team_id=A), B GET/PUT/DELETE task A → 404, A próbuje przypisać assignee z B → 400, dependency cross-team → 400 przed cycle, quick-add z @user_z_innego_teamu → token literal.
  - Done: `tests/test_basic.py` (tasks) + nowe scope testy zielone.
  - _Refs: R10, R12, R14, R15, R16, design 4, 9, 10_

- [x] 9. Projects routes — team scope
  - W endpointach projektów (`routes/tasks.py` lub wydzielony `routes/projects.py` — sprawdź): `Project.query` → `team_scoped`. `db.session.get(Project, id)` → `get_team_resource_or_404`.
  - W `create_project` set `project.team_id = g.current_team_id`.
  - Walidacja `member_ids`: każdy user musi mieć `team_id == g.current_team_id`. Inaczej 400 `cross_team_reference` (R11.3).
  - Update `visible_projects_for_user` żeby zaczynał od `team_scoped`.
  - `project_completion_status` operuje na `project.tasks` (relacja) — bez zmian.
  - `/project-templates GET` zwraca per-team kopie z `ProjectTemplate.query.filter_by(team_id=g.current_team_id).all()` zamiast słownika.
  - `/project-templates/{id}/use` używa per-team kopii (id z DB), payload kopiowany do nowego projektu.
  - Test: `tests/test_projects_team_scope.py` — A i B tworzą projekt o tej samej nazwie (po Task 7 unique per-team), oba istnieją niezależnie. Cross-team member_id → 400. /project-templates jako manager A → 3 templates seed.
  - Done: testy projektowe + isolation zielone.
  - _Refs: R11, R17, design 4, 7_

- [x] 10. Comments, subtasks, tags, custom_fields — team scope + denormalizacja
  - W `add_comment`: po Comment(...) ustaw `comment.team_id = task.team_id`.
  - W `add_subtask`: `subtask.team_id = task.team_id`.
  - W `manage_task_dependencies POST`: `dependency.team_id = task.team_id` (oba taski mają ten sam team po walidacji w Task 8).
  - CustomField endpoints (sprawdź czy są — w aktualnym kodzie modele są ale routes mogą być niepełne): analogicznie.
  - Tags: `team_scoped(Tag.query, Tag)` w listach. `Tag.team_id = g.current_team_id` przy create. Po Task 7 `UNIQUE (team_id, LOWER(name))` pozwala duplikatom między teamami.
  - Test: `tests/test_nested_resources_scope.py` — A tworzy task A1 + komentarz (team=A). B GET /tasks/A1/comments → 404. POST komentarza → 404. Tag "pilne" w obu teamach niezależnie.
  - Done: denormalizacja działa, isolation zielone.
  - _Refs: R12, design 3.2, 4_

- [x] 11. Filters, notifications, activity log — team scope
  - `routes/filters.py`: `team_scoped(SavedFilter.query, SavedFilter)`. `SavedFilter.team_id = g.current_team_id` przy create. Re-scope: gdy filter wykonuje query, dodatkowo filtrujemy wynik po team_id (R13.2).
  - `routes/notifications.py`: list i mark-read scoped per user_id + team_id.
  - `utils/notifications.py::create_notification`: rozszerz signature o opcjonalny `team_id` (z task.team_id lub g.current_team_id).
  - `emit_notifications`: emit `room=f'team:{notification.team_id}'`.
  - `routes/stats.py`: dashboard, weekly report. `Activity.query` → `team_scoped`. Aggregaty per team. `to_dict()` istniejący zwraca team_id ale nie expanded.
  - ActivityLog: każde `db.session.add(ActivityLog(...))` rozszerz o `team_id`.
  - Test: `tests/test_filters_notifications_scope.py` — filter A nie widzi w B. Notification user A nie pojawia się dla B. Activity log per team. Dashboard stats per team. Weekly report rozłączny.
  - Done: isolation zielone, weekly report dla A nie zawiera danych B.
  - _Refs: R13, R19, R20, design 4_

- [x] 12. Invite tokens + signup flow
  - Stwórz `routes/invites.py` (lub dodaj do `routes/users.py`):
    - `POST /team/invites` — manager only, walidacja `default_role='user'` (manager nie może wystawiać manager-invite). Generuj `secrets.token_urlsafe(32)`, zapisz `token_hash = sha256(raw)`. Response zwraca `raw_token` jednorazowo + `expires_at` (now + INVITE_TOKEN_TTL_DAYS).
    - `DELETE /team/invites/{id}` — revoke (tylko jeśli invite w teamie managera).
    - `GET /team/invites` — lista nieskonsumowanych dla teamu managera.
  - W `routes/auth.py::signup`:
    - Read `current_app.config['SIGNUP_MODE']`.
    - `disabled` → 403 `signup_disabled`.
    - `invite_only` → wymaga `invite_token` field. Sprawdź `TeamInvite` (active, nie consumed, team nie archived). Set team_id z invite, role z invite.default_role. Mark invite consumed_at + consumed_by_id.
    - `default_team` → znajdź team `Default`, set `team_id=default.id, role='user'`.
  - Stwórz `GET /auth/signup-info?token=...` (publiczny) — zwraca `{mode, team_name?}` (team_name tylko gdy token podany i ważny, do preview w UI).
  - Update `_ensure_default_admin` w `app.py` → tworzy `role='super_admin', team_id=None` (R3.4).
  - Test: `tests/test_invites.py` — manager A tworzy invite (response z raw token), kolejna lista bez raw. Anonim signup z ważnym tokenem → user w team A. Drugi signup tym samym tokenem → 410. Token archived team → 403. Manager próbuje wystawić invite z `default_role='manager'` → 400 (zablokowane).
  - Done: signup per SIGNUP_MODE, idempotent consumption.
  - _Refs: R3, R8, design 8_

- [x] 13. Socket.IO per-team rooms
  - W `app.py` (lub `utils/realtime.py`) dodaj `@socketio.on('connect')`:
    - Załaduj user z `session['user_id']`.
    - Super_admin → `join_room('super_admin')`.
    - Manager/user z aktywnym teamem → `join_room(f'team:{team_id}')`.
    - Team archived lub user invalid → `return False` (rejekt connect).
  - `emit_task_event` w `routes/tasks.py`: dodaj `room=f'team:{task.team_id}'`.
  - `emit_notifications` w `utils/notifications.py`: `room=f'team:{notification.team_id}'`.
  - Pozostałe `socketio.emit` (grep w `routes/`) — dodaj scope room.
  - Test: `tests/test_socketio_scope.py` — connect manager A joinuje `team:A`. Mutacja przez A → emit dotarł do A (mock socketio.emit, sprawdź arg `room`), nie dotarł do B.
  - Done: emit używa room arg, manualny test (dwie przeglądarki, różne teamy, brak cross-leak).
  - _Refs: R22, design 5_

- [ ] 14. Cross-team isolation parametrized tests
  - Stwórz `tests/test_cross_team_isolation.py`.
  - Fixtures: `team_a`, `team_b`, `manager_a_client`, `user_a_client`, `manager_b_client`, `super_admin_client` zgodnie z design 14.1.
  - Seed factory: `seed_team_resources(team)` tworzy 1 task, 1 project, 1 tag, 1 saved_filter, 1 task_template, 1 notification, 1 activity entry, 1 custom_field, 1 task_dependency.
  - Tabela parametryczna `TEAM_SCOPED_RESOURCES` z (method, path_template) dla każdego endpointa team-scoped (~30 entries).
  - Test 1: dla każdego entry, manager B request endpoint z resource id z A → 404 (R9.4, R31.1).
  - Test 2: list endpoints — manager B widzi 0 zasobów A w response (R31.2).
  - Test 3: super_admin request standardowego endpointa (np. /tasks) → pusta lista (R9.6).
  - Done: parametryczny test w CI, każda kombinacja (resource × method) zielona.
  - _Refs: R9, R31, design 14_

- [ ] 15. TypeScript types + AuthContext + api/client
  - `frontend/src/types/index.ts`:
    - `type Role = 'super_admin' | 'manager' | 'user'`.
    - `interface Team { id, name, slug, description, archived, created_at }`.
    - `interface InviteToken { id, expires_at, consumed_at, default_role, raw_token? }`.
    - `interface TeamAuditEntry { id, actor, action, target_team_id, target_user_id, source_team_id, details, created_at }`.
    - Update `User` o `team_id: number | null`, `team?: Team`.
  - `frontend/src/store/AuthContext.tsx`: dodaj `currentTeam: Team | null` z `user.team` po /auth/me.
  - `frontend/src/api/client.ts`: dodaj namespacy `api.teams`, `api.invites`, `api.signup` zgodnie z design 11.3.
  - Globalny error handler na `code: 'team_archived'` / `code: 'session_stale'` → wyloguj, redirect /auth.
  - Test: `npm run build` przechodzi bez TS errors.
  - Done: auth flow działa, useAuth() dostępne `currentTeam` i `user.role`.
  - _Refs: design 11_

- [ ] 16. RoleRoute guard + Layout adaptacja
  - Stwórz `frontend/src/components/common/RoleRoute.tsx` (jak w design 11.4).
  - W `App.tsx` opakowanie nowych rout w `<RoleRoute roles={['super_admin']}>...` itd.
  - W `DashboardLayout.tsx` warunkowy sidebar:
    - super_admin: tylko "Zespoły" + "Audyt".
    - manager: standardowy + "Członkowie zespołu" + "Zaproszenia".
    - user: standardowy bez "Admin".
  - Login flow: po `login()` jeśli `user.role === 'super_admin'` → redirect `/admin/teams`.
  - Test: manualny dla każdej z 3 ról.
  - Done: każda rola widzi swój widok, brak linków do nieautoryzowanych.
  - _Refs: R2, design 11.4, 11.5_

- [ ] 17. TeamsAdminPage + TeamDetailPage (super_admin)
  - `frontend/src/components/Admin/TeamsAdminPage.tsx`: lista zespołów (api.teams.list()), kolumny name/members/archived/created_at. Akcje: Create, Rename, Archive, Delete (handluje 409 `team_not_empty`).
  - `frontend/src/components/Admin/TeamDetailPage.tsx`: header z archive toggle. Lista członków (api.teams.members(id)). Akcje per user: promote/demote (PUT /admin/users/{id}/role), move to team (POST /admin/users/{id}/team). Sekcja audit log.
  - Routing: `/admin/teams`, `/admin/teams/:id`.
  - **Backend deps**: pełna funkcjonalność wymaga endpointów z Task 20. UI buduj wcześniej, mockuj dane jeśli trzeba; finalize po Task 20.
  - Test: manualny po deploy Task 20.
  - Done: super_admin może zarządzać zespołami przez UI.
  - _Refs: R5, R6, R7.5, design 11.4, 12.1_

- [ ] 18. TeamMembersPage + InviteForm (manager)
  - `frontend/src/components/Team/TeamMembersPage.tsx`: tab "Członkowie" (lista users w teamie z `api.users.getAll()` po refaktorze), tab "Zaproszenia" (`api.invites.list()`). Akcje: Generate invite, Revoke, Remove user.
  - `frontend/src/components/Team/InviteForm.tsx`: form z opcjonalnym email, role hardcoded `user`. Po submit pokazuje raw token (kopiuj-do-schowka) i link `https://app/signup?token={raw}`. Token widoczny tylko raz.
  - Test: manualny — manager generuje invite, kopiuje link, anon user otwiera, signup działa.
  - Done: manager flow zaproszeń kompletny.
  - _Refs: R7, R8, design 8, 11.4_

- [ ] 19. Signup z tokenem (rozszerzenie AuthPage)
  - `frontend/src/components/Auth/AuthPage.tsx`:
    - On mount: parse `?token=...`. Call `api.signup.info(token)`.
    - `mode='disabled'` → "Rejestracja wyłączona", ukryj formularz.
    - `mode='invite_only'` bez tokena → "Aby się zarejestrować, poproś menedżera o link".
    - `mode='invite_only'` z tokenem → "Dołączasz do zespołu: {team_name}", standardowy formularz, hidden input z tokenem.
    - `mode='default_team'` → standardowy formularz, brak tokena.
    - Submit: `api.auth.signup({...form, invite_token: token})`.
  - Test: manualny + jednostkowy TS.
  - Done: signup z linkiem od managera kończy się utworzeniem usera w odpowiednim teamie.
  - _Refs: R8, design 8.4_

- [ ] 20. Audit endpoints + super_admin admin endpoints
  - Stwórz `routes/admin.py` z endpointami z design 12.1:
    - `GET/POST /admin/teams`, `PUT /admin/teams/{id}`, `POST /admin/teams/{id}/archive`, `DELETE /admin/teams/{id}` (sprawdza `team_not_empty` — count członków + count team-scoped resources, jeśli > 0 → 409).
    - `GET /admin/teams/{id}/members`, `GET /admin/teams/{id}/audit`.
    - `POST /admin/users/{id}/team` — atomicznie: update user.team_id, bump session_version, reasign authored content per design 7.6 (Comments, ActivityLog, SavedFilters, Notifications usera idą z nim; tasks gdzie jest assignee zostają w starym teamie ale user usuwany z assignees), audit entry.
    - `POST /admin/users/{id}/role` — change role, walidacja (super_admin nie może mieć team_id, manager/user musi).
    - `GET /admin/audit` — globalny.
    - Opcjonalnie `GET /admin/stats` (aggregate per team) — można odsunąć.
  - Wszystkie endpointy `@require_super_admin`.
  - W każdej akcji: `db.session.add(TeamAuditLog(actor_id=user.id, action='...', ...))` przed commit.
  - Test: `tests/test_admin_endpoints.py` — pełen CRUD na teamach przez super_admina, manager → 403, walidacje (rename do istniejącej nazwy → 400, delete non-empty → 409).
  - Done: super_admin endpointy działają, audit log naliczany, frontend z Task 17 może wszystko wykonać.
  - _Refs: R5, R6, R7.5-7.7, R26, design 12.1_

- [ ] 21. Performance — verify indexes
  - Skrypt seed: `scripts/seed_perf.py` — 5 zespołów × 1000 tasków × 5 komentarzy + 100 projektów + 50 userów per team.
  - `EXPLAIN ANALYZE` na top endpointach (Postgres):
    - `GET /tasks?page=1&per_page=50`
    - `GET /tasks/today`
    - `GET /stats/dashboard`
    - `GET /tasks/blocked`
  - Cel: każdy <100ms p95. Jeśli przekracza → dodaj brakujący composite index, re-test.
  - Done: 4 endpointy <100ms p95 na seed dataset.
  - _Refs: R28, design 15_

- [ ] 22. Documentation update
  - `README.md`: sekcja "Role i Uprawnienia" rozszerzona o trzy poziomy (super_admin / manager / user) z opisem co kto może.
  - `AGENTS.md`: dodaj sekcję "Authorization Layer" — opis `team_scoped`, `require_role`, `g.current_team_id`. Update "Common Pitfalls" o "Pamiętaj o team_id przy create na denormalized resources (Comment, Subtask, TaskDependency)".
  - `DEPLOYMENT.md`: opis `SIGNUP_MODE`, dodatkowe env vars, kroki migracji na produkcji (backup pg_dump + apply + verify).
  - `.env.example` z nowymi zmiennymi (SIGNUP_MODE, INVITE_TOKEN_TTL_DAYS).
  - Done: dokumentacja odzwierciedla nowy model.
  - _Refs: R23.3_

## Notes

### Status (aktualizacja 2026-05-24)

**Ukończone (Wave 1 + Wave 2 + hotfix):**

| Task | Commit | Testy |
|------|--------|-------|
| 1 — Error vocabulary + config | `e89097c` | 11 testów |
| 2 — Team/TeamInvite/TeamAuditLog models | `1e51dcb` | 11 testów |
| 3 — User.team_id + session_version | `5823926` | 8 testów |
| 4 — Authorization Layer | `20601d3` | 17 testów |
| 5 — ProjectTemplate + catalogue | `6ffe635` | 7 testów |
| 6 — Migracja 001 (schema + backfill) | `ea6e45d` | 6 testów |
| 7 — Migracja 002 (NOT NULL + constraints) | `23ad174` | 3 testy |
| **hotfix** — frontend role super_admin | `5a72efc` | build TS ✅ |

**Łącznie: 117 passed, 1 skipped** (stan po Task 7 + hotfix)

**Checkpoint A** ✅ (po Task 4) — modele i auth shell  
**Checkpoint B** ✅ (po Task 7) — migracje działają, Default team, super_admin promoted

**Następny: Task 8** — refaktor `routes/tasks.py` → team scope

---

### Checkpoints (sensowne PR boundaries)

- **Po Task 4** — Checkpoint A: modele i auth shell istnieją, aplikacja dalej działa jak przed zmianami.
- **Po Task 7** — Checkpoint B: migracja działa lokalnie i na pg_dump produkcji. Default team istnieje, super_admin promoted.
- **Po Task 14** — Checkpoint C: backend kompletny, isolation testy zielone.
- **Po Task 19** — Checkpoint D: frontend kompletny, manualny smoke test pełnego flow.
- **Po Task 22** — Checkpoint E: gotowe do deploy na Railway.

### Reguły wykonania

- Każdy task atomic: kończysz, build zielony, opcjonalnie commit. Nie zaczynasz następnego z czerwonym buildem.
- Migracja na produkcji TYLKO po pełnym backupie. `pg_dump` Railway → restore lokalnie → test → deploy.
- Feature flag NIE wprowadzamy. Single deploy z migracją w start.sh. Jeśli coś się sypnie, `flask db downgrade` + redeploy poprzedniej wersji.
- `@login_required` zostaje jako alias `@require_team_member` dopóki wszystkie routy nie są zrefaktorowane. Pod koniec Phase 3 możesz go zastąpić explicite.

### Rollout (po Task 22)

1. `pg_dump` produkcji → backup.
2. Test backup → restore → migracja lokalnie.
3. Push do `main`. Railway buduje + `start.sh` aplikuje migracje.
4. Login bootstrap admin → role super_admin.
5. Promote Lucyna → manager (UI lub SQL hotfix).
6. Promote Agnieszka → manager.
7. Tworzenie zespołów: "Marketing-Lucyna", "Operations-Agnieszka".
8. Move userów między zespołami.
9. Monitor logów 24h, sprawdź `/admin/audit`.

### Estymacja per phase

| Phase | Tasks | Effort |
|---|---|---|
| 1 — Fundament | 1-4 | ~1 dzień |
| 2 — Migracja | 5-7 | ~1.5 dnia |
| 3 — Backend per resource | 8-13 | ~3 dni |
| 4 — Isolation tests | 14 | ~0.5 dnia |
| 5 — Frontend | 15-19 | ~2 dni |
| 6 — Polish | 20-22 | ~0.5 dnia |
| **Total** | **22** | **~8.5 dnia + 30% rezerwy = ~11 dni** |
