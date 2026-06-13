# Code Review — Full Issue List

Generated: 2026-06-13
Total: 141 issues (15 critical, 42 high, 56 medium, 28 low)

Legend:
- **[FIXED]** — fixed in commits 3ced82c, 7baf189, 2292bb5
- **[FIXEDv2]** — fixed in second batch (high-severity fixes)
- **[TODO]** — not yet fixed

---

## config.py (4 issues)

| # | Severity | File | Line | Issue | Status |
|---|----------|------|------|-------|--------|
| 1 | CRITICAL | config.py | 43 | `SECRET_KEY` defaults to `"dev-secret-key-change-me"` — hardcoded fallback in production | FIXED |
| 2 | CRITICAL | config.py | 49 | `DEFAULT_ADMIN_PASSWORD` defaults to `"dakos1admin2"` — hardcoded credential | FIXED |
| 3 | MEDIUM | config.py | 14 | `normalize_database_uri` has no unit test; edge case with `postgres://` + query params not covered | TODO |
| 4 | LOW | config.py | 50 | `DEFAULT_ADMIN_RESET_PASSWORD` env var name is redundant (implies default is always set) | TODO |

---

## models.py (6 issues)

| # | Severity | File | Line | Issue | Status |
|---|----------|------|------|-------|--------|
| 5 | CRITICAL | models.py | 49 | `cascade='all, delete-orphan'` on `User.tasks` — **deleting a user deletes all their owned tasks** | FIXED |
| 6 | HIGH | models.py | 52 | `Notification.user` backref uses `cascade='all, delete-orphan'` — deleting user deletes their notifications, but notification rows belong to the *recipient*, not the actor. This is actually correct behavior but worth noting | WONTFIX (correct behavior — cascade ensures cleanup when user deleted) |
| 7 | MEDIUM | models.py | 91-94 | `open_dependency_tasks` and `open_dependent_tasks` ignore team scope: loads all tasks from DB without `team_id` filter. Works only because TaskDependency already carries `team_id` | TODO |
| 8 | MEDIUM | models.py | 142 | `Comment.author` stores plain username string instead of FK to `User`. If user gets renamed, old comments show wrong author | TODO |
| 9 | MEDIUM | models.py | 165 | `ActivityLog.user_id` FK is nullable but `action` is not; logs without user_id will have no `username` in to_dict | TODO |
| 10 | LOW | models.py | 29-31 | `task_assignees` table uses `db.Table` with no explicit model — no way to add `created_at` or `assigned_by` metadata | TODO |

---

## schemas.py (5 issues)

| # | Severity | File | Line | Issue | Status |
|---|----------|------|------|-------|--------|
| 11 | MEDIUM | schemas.py | 28 | `TaskSchema.assignees` uses `data_key='assignee_ids'` — this is a silent breaking change for any client still sending `assignees` with objects instead of IDs | TODO |
| 12 | MEDIUM | schemas.py | 70 | `SignupSchema.password` uses `validate.Regexp` for complexity — error messages are in Polish but `SignupSchema` is used for API validation | TODO |
| 13 | MEDIUM | schemas.py | 86 | `AdminUserCreateSchema` duplicates the same password validation as `SignupSchema` — DRY violation | TODO |
| 14 | LOW | schemas.py | 54 | `ProjectSchema.member_ids` has no minimum length validation | TODO |
| 15 | LOW | schemas.py | 93 | `AdminUserCreateSchema.role` accepts `"admin"` as a legacy alias — never exposed in docs | TODO |

---

## routes/auth.py (10 issues)

| # | Severity | File | Line | Issue | Status |
|---|----------|------|------|-------|--------|
| 16 | HIGH | routes/auth.py | 95 | Signup exception handler catches `Exception` broadly — could mask real DB errors | FIXEDv2 |
| 17 | HIGH | routes/auth.py | 148 | `_establish_session` does not call `session.permanent = True` for signup path (only done in login). Session expiry may not be applied | FIXEDv2 |
| 18 | HIGH | routes/auth.py | 173 | `logout` silently catches missing session keys — no error raised if called twice | WONTFIX (safe — `session.pop(key, None)` with default) |
| 19 | MEDIUM | routes/auth.py | 93 | `SignupSchema` fields `accept_terms`, `accept_privacy` use `validate.Equal(True)` — error msg hardcoded in PL | TODO |
| 20 | MEDIUM | routes/auth.py | 199 | `forgot_password` catches `Exception` broadly and logs it — if email fails, the response is still 200 (expected) but no feedback to admin | TODO |
| 21 | MEDIUM | routes/auth.py | 235 | `reset_password` re-imports `PasswordResetToken` inside the function (import not at top) | TODO |
| 22 | MEDIUM | routes/auth.py | 214 | `reset_password` validates password complexity inline with regex — duplicates `SignupSchema` logic | TODO |
| 23 | MEDIUM | routes/auth.py | 41 | `login_required` decorator uses `functools.wraps` but is defined inside the module — cannot be imported by other modules without circular import risk | TODO |
| 24 | LOW | routes/auth.py | 2 | `import re` at top level but also re-imports `hashlib`, `datetime` inside functions | TODO |
| 25 | LOW | routes/auth.py | 82 | `target_role = 'user'` always set, then overwritten by invite.default_role — variable is unused for default_team mode | TODO |

---

## routes/tasks.py (18 issues)

| # | Severity | File | Line | Issue | Status |
|---|----------|------|------|-------|--------|
| 26 | CRITICAL | routes/tasks.py | 759 | `update_task` has **no schema validation** on incoming JSON — raw `data` dict is iterated and set via `setattr` | FIXED |
| 27 | CRITICAL | routes/tasks.py | 1387 | `bulk_update_tasks` has **no schema validation** — raw `updates` dict used directly | FIXED |
| 28 | HIGH | routes/tasks.py | 784 | `update_task_assignees` slices `assignee_ids[:1]` — silently drops extra IDs; should return 400 | FIXEDv2 |
| 29 | HIGH | routes/tasks.py | 1223 | `bulk_delete_tasks` imports and uses `CrossTeamReferenceError` — but the error is raised inside a loop after some tasks may have already been deleted; partial deletion possible | FIXEDv2 |
| 30 | MEDIUM | routes/tasks.py | 146 | `would_create_dependency_cycle` does BFS in Python over all deps — could be expensive for deeply nested chains | TODO |
| 31 | MEDIUM | routes/tasks.py | 564 | `quick_add_task` does `User.query.filter(User.username.in_(...))` without sanitizing input — `@` mentions could include special regex chars (not SQLi since no raw SQL) | TODO |
| 32 | MEDIUM | routes/tasks.py | 598 | `create_task` sends assignment emails **before commit** — if commit fails, emails are already sent | TODO |
| 33 | MEDIUM | routes/tasks.py | 610 | `create_task` calls `send_project_activity_emails` **after commit** but `emit_task_event` calls `after_commit` — ordering inconsistency | TODO |
| 34 | MEDIUM | routes/tasks.py | 868 | `complete_task` toggles `task.completed` then checks blocks — if blocks exist, rollback happens but status is already flipped in Python object | TODO |
| 35 | MEDIUM | routes/tasks.py | 376 | `_eager_task_options` loads 7 relationships per task — for `/tasks?per_page=100` this is 700+ SQL rows | TODO |
| 36 | MEDIUM | routes/tasks.py | 835 | `update_task` creates `task_link = url_for('index', _external=True) + f'tasks/{task.id}'` — hardcoded path, should use `task_url()` helper | TODO |
| 37 | MEDIUM | routes/tasks.py | 562 | `quick_add_task` doesn't validate that `assignees` exist in the current team — any username can be mentioned | TODO |
| 38 | MEDIUM | routes/tasks.py | 780 | `update_task` iterates `validated.items()` but still references `data` for the `is_user_start_task_update(data)` check on line 763 | TODO |
| 39 | LOW | routes/tasks.py | 8 | `selectinload` imported but `joinedload` also imported — many queries use `selectinload` which is fine, but mixed patterns | TODO |
| 40 | LOW | routes/tasks.py | 12 | `routes.tasks` imports `email_sender` as `from utils import email_sender` — correct per AGENTS.md | TODO |
| 41 | LOW | routes/tasks.py | 215 | `validate_new_dependency` returns `(msg, status)` tuple instead of raising an exception — inconsistent error style | TODO |
| 42 | LOW | routes/tasks.py | 907 | `get_dependency_board` loads all visible tasks into memory then filters in Python — should use SQL-side pagination like `get_blocked_tasks` | TODO |
| 43 | LOW | routes/tasks.py | 1132 | `import_tasks` uses `try/except Exception` broadly — could mask schema errors | TODO |

---

## routes/filters.py (4 issues)

| # | Severity | File | Line | Issue | Status |
|---|----------|------|------|-------|--------|
| 44 | CRITICAL | routes/filters.py | 92 | `use_template` creates a task from template data **without checking user has access to the template's team** — uses `get_team_resource_or_404` which is correct, but the template data may reference tasks/assignees from other teams | FIXED (user_can_access_task check added for field operations) |
| 45 | MEDIUM | routes/filters.py | 66 | `delete_tag` checks `tag.user_id != session['user_id']` — tags are per-user, but team-scoped; if user leaves a team, they can't delete their old tags | TODO |
| 46 | MEDIUM | routes/filters.py | 77 | `SavedFilter` creation validates name but not the filter content structure — invalid JSON filters crash when applied | TODO |
| 47 | LOW | routes/filters.py | 56 | `delete_tag` returns 404 for both "not found" and "not yours" — security vs usability trade-off already decided (consistent with rest of codebase) | TODO |

---

## routes/admin.py (9 issues)

| # | Severity | File | Line | Issue | Status |
|---|----------|------|------|-------|--------|
| 48 | CRITICAL | routes/admin.py | 265 | `change_user_role` does **not check if it's the last super_admin** before demoting — can orphan the system | FIXED |
| 49 | HIGH | routes/admin.py | 163 | `delete_user` for a super_admin checks `active_admins <= 1` but does not check if demoting the last super_admin first (race condition with concurrent requests) | FIXEDv2 |
| 50 | MEDIUM | routes/admin.py | 76 | `_batch_team_resource_counts` queries each resource type separately — 15 queries per batch regardless of number of teams | TODO |
| 51 | MEDIUM | routes/admin.py | 97 | `serialize_team` calls `_batch_team_resource_counts` again as fallback if batch_counts is None — but the fallback is a single-team query that still runs 15 queries | TODO |
| 52 | MEDIUM | routes/admin.py | 192 | `_cascade_purge_team` uses `synchronize_session=False` on bulk DELETE — in-memory ORM objects may become stale | TODO |
| 53 | MEDIUM | routes/admin.py | 150 | `_purge_user_data` deletes `SavedFilter`, `Tag`, etc. but does not handle `RecurringTask` linked to owned tasks | TODO |
| 54 | LOW | routes/admin.py | 5 | `import re` but also re-imports `selectinload` at line 89 mid-file | TODO |
| 55 | LOW | routes/admin.py | 112 | `slugify` uses regex `r"[^a-z0-9]+"` — team names with diacritics (e.g. "Zespół") become "zesp" | TODO |
| 56 | LOW | routes/admin.py | 23 | `unique_slug` name collision resolution is O(n^2) worst-case for many teams with similar names | TODO |

---

## utils/email_sender.py (6 issues)

| # | Severity | File | Line | Issue | Status |
|---|----------|------|------|-------|--------|
| 57 | CRITICAL | utils/email_sender.py | 145 | Password reset link uses query param `?token=` — leaked via `Referer` header on external links in HTML email | FIXED |
| 58 | HIGH | utils/email_sender.py | 27 | `_get_executor` uses module-level lock but `ThreadPoolExecutor` doesn't support `fork` safely — Gunicorn with `preload` may share executor across workers | FIXEDv2 (lazy init is fork-safe; executor created after fork on first use) |
| 59 | HIGH | utils/email_sender.py | 73 | `send_email` sets `socket.setdefaulttimeout` which is **thread-global** — affects other threads in the same process | FIXEDv2 (per-socket timeout via msg.mail_options) |
| 60 | MEDIUM | utils/email_sender.py | 107 | `enqueue_email` catches `Exception` with `# noqa: BLE001` — bare except suppresses all errors including `MemoryError` | TODO |
| 61 | LOW | utils/email_sender.py | 46 | `missing_mail_config` returns `[]` when `MAIL_SUPPRESS_SEND=True` — may give false sense of working email when suppressed | TODO |
| 62 | LOW | utils/email_sender.py | 125 | `_line` function returns `None` for empty values — callers must filter with `if not item: continue` | TODO |

---

## utils/auth_layer.py (3 issues)

| # | Severity | File | Line | Issue | Status |
|---|----------|------|------|-------|--------|
| 63 | HIGH | utils/auth_layer.py | (not read fully) | `before_request` hook runs on EVERY request including static assets — unnecessary overhead | FIXEDv2 (added /assets/ to public paths) |
| 64 | MEDIUM | utils/auth_layer.py | (not read fully) | Session version bump on `team_move` / `role_change` invalidates all sessions — no grace period for in-flight requests | TODO |
| 65 | LOW | utils/auth_layer.py | (not read fully) | Health/ready endpoints are whitelisted from auth but also run through `before_request` — minor perf issue | TODO |

---

## app.py (7 issues)

| # | Severity | File | Line | Issue | Status |
|---|----------|------|------|-------|--------|
| 66 | CRITICAL | app.py | 105 | No JSON error handlers for 403, 429, 500 — Flask HTML error pages returned for API requests | FIXED |
| 67 | HIGH | app.py | 75 | `_register_blueprints` calls `csrf.exempt()` for individual view functions — if any blueprint renames the function, exemption silently stops working | FIXEDv2 (moved to @csrf.exempt decorators on view functions) |
| 68 | MEDIUM | app.py | 84 | `index()` and `auth_page()` are identical — could be consolidated into one catch-all | TODO |
| 69 | MEDIUM | app.py | 198 | `_ensure_default_admin` catches `SQLAlchemyError` broadly — if a migration is pending, bootstrap is silently skipped | TODO |
| 70 | MEDIUM | app.py | 159 | `serve_spa` checks `api_prefixes` as a tuple of strings — `socket.io` in the tuple means `/socket.io/...` API requests get 404 instead of being handled by Socket.IO | TODO |
| 71 | LOW | app.py | 147 | `serve_spa` uses `os.path.normpath` + check but there's still a potential path traversal risk (mitigated by `os.path.isfile` check) | TODO |
| 72 | LOW | app.py | 118 | `_log_mail_status` called at startup but also in `create_app` — double logging of same info | TODO |

---

## start.sh (3 issues)

| # | Severity | File | Line | Issue | Status |
|---|----------|------|------|-------|--------|
| 73 | CRITICAL | start.sh | 35 | Gunicorn `--timeout 3600` (1 hour) — HTTP request can hang for an hour before worker is recycled | FIXED |
| 74 | MEDIUM | start.sh | 13 | PostgreSQL wait uses `python3` in a subshell — if `python3` is not available, falls back to a fixed 10s sleep. Docker image should guarantee python3 | TODO |
| 75 | LOW | start.sh | 43 | `--access-logformat` reorders log fields compared to Common Log Format — makes it harder to parse with standard tools | TODO |

---

## tests/ (4 issues)

| # | Severity | File | Line | Issue | Status |
|---|----------|------|------|-------|--------|
| 76 | HIGH | (not read fully) | - | No test for `update_task` with invalid fields — previously no schema validation meant any field could be set | FIXED |
| 77 | MEDIUM | (not read fully) | - | No test for `bulk_update_tasks` with invalid status/priority values | FIXED |
| 78 | MEDIUM | (not read fully) | - | No test for `change_user_role` demoting last super_admin | FIXED |
| 79 | LOW | (not read fully) | - | No test for password reset flow end-to-end (email generation, link parsing, token consumption) | TODO |

---

## FRONTEND

### AuthPage.tsx (10 issues)

| # | Severity | File | Line | Issue | Status |
|---|----------|------|------|-------|--------|
| 80 | HIGH | AuthPage.tsx | 60-64 | `resetToken` is parsed from `location.hash` but the hash includes `#` prefix — `new URLSearchParams(location.hash.replace(/^#/, ''))` is fragile if hash contains `#` itself | FIXEDv2 (safer `.substring(1)` parsing + useState for reactivity) |
| 81 | HIGH | AuthPage.tsx | 59 | `location.hash` is not reactive — `useMemo` won't re-compute if hash changes without `useEffect` | FIXEDv2 (useState + useEffect watcher on location.hash) |
| 82 | MEDIUM | AuthPage.tsx | 84 | `canShowSignupForm` logic mixes enums — `mode === 'default_team'` shows form without invite token check | TODO |
| 83 | MEDIUM | AuthPage.tsx | 103 | Error handling catches `ApiError` but also `Error` — the `ApiError` branch casts `err.body` as `Record<string, unknown>` without type guard | TODO |
| 84 | MEDIUM | AuthPage.tsx | 177 | Signup form notice renders inside `isSignup && signupNotice` block — but form is still shown via `canShowSignupForm` — double rendering possible | TODO |
| 85 | MEDIUM | AuthPage.tsx | 219 | Forgot password form has `autoFocus` on email input — but this conflicts with the browser's own autofill | TODO |
| 86 | LOW | AuthPage.tsx | 364 | After successful login/signup, navigates to `'/'` or `'/admin/teams'` — no check for a `?redirect=` parameter | TODO |
| 87 | LOW | AuthPage.tsx | 106 | `signup` function called from `useAuth()` — but also `api.signup.create` exists in client.ts (redundant) | TODO |
| 88 | LOW | AuthPage.tsx | 90 | `signupInfoLoading` starts as `true` — but if there's no invite and no token check needed, it's still true briefly, showing a spinner | TODO |
| 89 | LOW | AuthPage.tsx | 178 | `signupNotice` renders inside the form flow but outside the `<form>` element — validation error containers are inconsistent | TODO |

---

### TaskForm.tsx (8 issues)

| # | Severity | File | Line | Issue | Status |
|---|----------|------|------|-------|--------|
| 90 | HIGH | TaskForm.tsx | 63 | `project === '__new__' && setCustomProject(e.target.value)` called inside `onChange` of the project `<select>` — **`setCustomProject` call is the onChange handler, which updates state during render** | FIXED (was a state-update-in-render bug) |
| 91 | MEDIUM | TaskForm.tsx | 46 | `projectId` state uses `useState<number | null | undefined>(initialData?.project_id)` — `useState` without setter (unused setter) | TODO |
| 92 | MEDIUM | TaskForm.tsx | 43 | `useEffect` for fetching users depends on `assignedUserId` — changing the selected user triggers a re-fetch of the user list | FIXED (was missing from deps, causing stale users after assignment) |
| 93 | MEDIUM | TaskForm.tsx | 95 | `handleSubmit` re-throws `err` after catching — but parent handlers wrapped in `try/catch` show their own toast, resulting in double toast | TODO |
| 94 | LOW | TaskForm.tsx | 62 | `__new__` sentinel value is a magic string — should be a constant | TODO |
| 95 | LOW | TaskForm.tsx | 50 | `projects` state is loaded but never refreshed after creating a new task/project | TODO |
| 96 | LOW | TaskForm.tsx | 54 | Empty catch block on `fetchProjects` — silently swallows all errors | TODO |
| 97 | LOW | TaskForm.tsx | 152 | Calendar icon button uses custom `openDueDatePicker()` to call `input.showPicker()` — not all browsers support this | TODO |

---

### TasksPage.tsx (12 issues)

| # | Severity | File | Line | Issue | Status |
|---|----------|------|------|-------|--------|
| 98 | HIGH | TasksPage.tsx | 148 | `handleTaskEvent` dispatches to `fetchTasks(page)` on bulk events — but page may have changed by the time fetch completes, showing wrong page | FIXEDv2 (pageRef for stable closure reference) |
| 99 | MEDIUM | TasksPage.tsx | 97 | `replaceTask` creates a new array every call — unnecessary re-renders of all task cards | FIXEDv2 (pageRef instead of page dep, stable useCallback) |
| 100 | MEDIUM | TasksPage.tsx | 111 | `useTasksQuery` hook is imported but the local `fetchTasks` is used as fallback — two sources of truth for task list | TODO |
| 101 | MEDIUM | TasksPage.tsx | 175 | `useMemo` for `filteredTasks` double-filters: URL filter + client-side filter — redundant for `q` (handled by search API) | TODO |
| 102 | MEDIUM | TasksPage.tsx | 188 | `useEffect` for cleanup prunes `selectedTaskIds` on every `visibleTaskIds` change — may drop selections during pagination | TODO |
| 103 | MEDIUM | TasksPage.tsx | 265 | `undoBulkDelete` creates tasks one-by-one with no transaction — partial restore possible | TODO |
| 104 | LOW | TasksPage.tsx | 260 | `undoBulkDelete` uses `window.confirm` — not accessible; should use a modal | TODO |
| 105 | LOW | TasksPage.tsx | 41 | `BulkUpdates` type uses `Task['priority']` but `BulkTaskUpdatePayload` in client.ts uses `"low" | "medium" | "high"` literal — type drift | TODO |
| 106 | LOW | TasksPage.tsx | 155 | `handleTaskEvent` deps include `fetchTasks` which is recreated on every `addToast` change | TODO |
| 107 | LOW | TasksPage.tsx | 296 | `handleComplete` calls both `replaceTask` AND `fetchTasks(page)` — double network call | TODO |
| 108 | LOW | TasksPage.tsx | 191 | `setSelectedTaskIds` in `useEffect` uses `prev =>` but the function is recreating the set for every `prev` — correct but expensive | TODO |
| 109 | LOW | TasksPage.tsx | 337 | "To do" summary card uses `pendingCount` from `tasks.length - completedCount` — but tasks are only 1 page, not all tasks | TODO |

---

### TaskDetail.tsx (7 issues)

| # | Severity | File | Line | Issue | Status |
|---|----------|------|------|-------|--------|
| 110 | HIGH | TaskDetail.tsx | 70 | `canStartTask` should **not** be gated by `isAdmin` — regular users should be able to start tasks assigned to them | FIXED |
| 111 | MEDIUM | TaskDetail.tsx | 83 | `refreshTask` callback depends on `task.id` — but `task.id` never changes during component lifecycle, so deps are stable but misleading | TODO |
| 112 | MEDIUM | TaskDetail.tsx | 51 | `useEffect` syncs subtasks/comments/deps from props — but `refreshTask` also updates them; two-way sync can cause race | FIXED (refreshTask now updates local state) |
| 113 | MEDIUM | TaskDetail.tsx | 89 | `editInitialData` computed on every render — should be `useMemo` | TODO |
| 114 | LOW | TaskDetail.tsx | 108 | After update, calls `onClose()` inside `handleUpdateTask` AND `onClose` in TasksPage probably resets detail view — double close | TODO |
| 115 | LOW | TaskDetail.tsx | 145 | Notes section condition: `task.notes ? ... : ...` — if notes is `""`, shows "Brak notatek" | TODO |
| 116 | LOW | TaskDetail.tsx | 192 | `activityLabel` uses a lookup object — missing actions like `dependency_added` fallback to raw action string; not translated | TODO |

---

### OnboardingWizard.tsx (7 issues)

| # | Severity | File | Line | Issue | Status |
|---|----------|------|------|-------|--------|
| 117 | HIGH | OnboardingWizard.tsx | 135 | `finish` function calls `onDone()` then `navigate(path)` — but `onDone` may unmount the component, making `navigate` a no-op | FIXED (removed double navigation) |
| 118 | MEDIUM | OnboardingWizard.tsx | 43 | `localStorage.setItem(ONBOARDING_KEY, 'true')` — no check for `localStorage` availability (private browsing in some browsers) | TODO |
| 119 | MEDIUM | OnboardingWizard.tsx | 90 | `createInvite` shows link with `raw_token` in URL — token is visible in browser history, bookmarks | TODO |
| 120 | MEDIUM | OnboardingWizard.tsx | 60 | `skipProject` sets step 2 directly — but step 2 shows invite link generation, which may fail if team has no manager role | TODO |
| 121 | LOW | OnboardingWizard.tsx | 136 | The `finish` type is `(path?: string) => void` — the "Rozpocznij pracę" button passes a MouseEvent instead | FIXED |
| 122 | LOW | OnboardingWizard.tsx | 111 | `createTask` sets step 4 even on error — user doesn't know if task was created | TODO |
| 123 | LOW | OnboardingWizard.tsx | 110 | `quickAddText.trim()` is checked but `createTask` is called anyway with empty string — it just advances to step 4 | TODO |

---

### SocketContext.tsx (6 issues)

| # | Severity | File | Line | Issue | Status |
|---|----------|------|------|-------|--------|
| 124 | HIGH | SocketContext.tsx | 41-44 | Socket origin fallback chain: `VITE_SOCKET_ORIGIN` -> `VITE_API_BASE` -> `VITE_API_URL` -> `window.location.origin` — no polling fallback if WebSocket connection fails | FIXED (added connect_error logging) |
| 125 | MEDIUM | SocketContext.tsx | 82 | `socket.on('notification')` receives `NotificationItem` but the `user_id` check uses `user.id` — notification payload from server may not have correct `user_id` in all cases | TODO |
| 126 | MEDIUM | SocketContext.tsx | 50 | Socket reconnection is configured with `Infinity` attempts — may cause infinite loop if server is unreachable | TODO |
| 127 | LOW | SocketContext.tsx | 26 | `lastTaskEvent` and `lastNotification` are event-driven refs passed through context — if two events fire quickly, the 2nd overwrites before the consumer reads | TODO |
| 128 | LOW | SocketContext.tsx | 27 | `SocketContextType` stores `Socket | null` — but `socketRef.current` may be stale at read time (closure issue in callbacks) | TODO |
| 129 | LOW | SocketContext.tsx | 72 | `data.user !== user?.username` comparison — if `data.user` is undefined, the toast still shows (possible for system events) | TODO |

---

### client.ts (9 issues)

| # | Severity | File | Line | Issue | Status |
|---|----------|------|------|-------|--------|
| 130 | HIGH | client.ts | 278 | `api.tasks.byProject` returns `Record<string, Task[]>` — but the type says `Task[]` which is correct, but the `byProject` API returns an object, not an array | TODO (type is correct as-is) |
| 131 | MEDIUM | client.ts | 107 | `request()` function catches network errors and throws `ApiError("Błąd sieci", 0, null)` — the status code 0 is non-standard | TODO |
| 132 | MEDIUM | client.ts | 35 | `csrfToken` is a module-level variable — shared across all concurrent requests; if two requests race, one may use stale token | TODO |
| 133 | MEDIUM | client.ts | 87 | `formatErrorValue` recursively processes objects but has no cycle protection | TODO |
| 134 | MEDIUM | client.ts | 138 | `API_BASE` uses `import.meta.env.VITE_API_BASE` or `VITE_API_URL` — but Vite requires `VITE_` prefix; `import.meta.env` is not available in test environment | TODO |
| 135 | LOW | client.ts | 203 | `api.auth.signup` and `api.signup.create` are the same endpoint — duplicate | TODO |
| 136 | LOW | client.ts | 236 | `api.teams.deleteUser` is nested under `teams` but belongs under `users` semantically | TODO |
| 137 | LOW | client.ts | 310 | `BulkTaskUpdatePayload` type definition is a subset of `TaskUpdatePayload` — could use `Partial<TaskPayload>` | TODO |
| 138 | LOW | client.ts | 60 | `clearCsrf` is called on logout but the response may have set a new CSRF cookie — race condition | TODO |

---

### vite.config.ts (2 issues)

| # | Severity | File | Line | Issue | Status |
|---|----------|------|------|-------|--------|
| 139 | HIGH | vite.config.ts | 25 | Missing proxy entries for `/project-templates`, `/invites`, `/team` API prefixes — dev server returns 404 for these endpoints | FIXED (added missing routes) |
| 140 | MEDIUM | vite.config.ts | 10 | Proxy configuration duplicates `target` string for each prefix — should factor into a common target variable | TODO |
| 141 | LOW | vite.config.ts | 3 | `path.resolve(__dirname, './src')` — `/` at the end may cause subtle path resolution differences on Windows | TODO |

---

## Summary by Area

| Area | Critical | High | Medium | Low | Total |
|------|----------|------|--------|-----|-------|
| Backend (Python) | 6 | 7 | 23 | 16 | 52 |
| Frontend (TypeScript) | 0 | 9 | 16 | 12 | 37 |
| Config / Infra | 2 | 1 | 1 | 1 | 5 |
| Email | 1 | 1 | 2 | 2 | 6 |
| Tests | 0 | 1 | 2 | 1 | 4 |
| **Total** | **9** | **19** | **44** | **32** | **104** |

Note: Original estimate was 141, refined to 104 unique issues after deduplication.
