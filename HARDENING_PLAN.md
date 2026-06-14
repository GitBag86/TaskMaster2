# TaskMaster2 — Consolidated Hardening Plan

> **Supersedes:** `docs/code-review-issues.md`  
> **Generated:** 2026-06-14  
> **Scope:** Formalizes all remaining TODOs from the code review and cross-references `roadmap.md` Phase 1 / `PLAN.md` deferred features.  
> **Constraint:** Document only — no code changes in this pass.

---

## Executive Summary

The `docs/code-review-issues.md` audit (2026-06-13) identified **141 issues** across the TaskMaster2 codebase. Four fix batches reduced this to **78 remaining TODOs** (28 Medium, 50 Low). This plan consolidates those 78 TODOs into six actionable hardening themes, adds effort estimates, and cross-references existing planning documents so nothing is tracked in two places.

**Key insight:** The remaining work is overwhelmingly in two areas — **Error Handling & Reliability** (30 items) and **Code Quality & Maintainability** (24 items). Security-related TODOs are fewer but still material (14 items). Performance TODOs are concentrated in `routes/tasks.py` and `routes/admin.py`.

**Roadmap.md Phase 1 overlap:** Several `roadmap.md` Phase 1 items (structured logging, error-path testing, session security) were already addressed in the committed fix batches. The remaining `roadmap.md` Phase 1 items that **do not yet appear as resolved TODOs** are referenced explicitly in Section 7.

**PLAN.md deferred features:** Two items (Recurring tasks UI, Project templates UI) are acknowledged but remain deferred per the user's prior decision; they are not re-described here.

---

## Severity Overview

| Severity | Count | Priority |
|----------|-------|----------|
| Medium   | 28    | Address in next 1–2 sprints |
| Low      | 50    | Backlog / good-first-issue |
| **Total**    | **78**    | |

---

## Theme 1: Security & Authorization

*14 items — highest impact per item. Address before other themes.*

| Issue # | Sev | File | Line | Description | Rationale | Fix Approach | Effort |
|---------|-----|------|------|-------------|-----------|--------------|--------|
| #3 | M | `config.py` | 14 | `normalize_database_uri` has no unit test; edge case with `postgres://` + query params not covered | Production DB connection strings must not break silently on edge-case URI formats | Add pytest cases for `postgres://`, `postgresql://`, `postgresql+psycopg://`, query params, and invalid inputs | 1h |
| #7 | M | `models.py` | 91–94 | `open_dependency_tasks` / `open_dependent_tasks` ignore `team_id` scope | In a multi-tenant system, model helpers must never load cross-team data — even if the caller currently filters | Add `team_id` filter to the helper queries; add a test asserting cross-team isolation at the model layer | 2h |
| #8 | M | `models.py` | 142 | `Comment.author` stores plain username string instead of FK to `User` | Renaming a user breaks comment authorship history; also prevents efficient join queries | Migration: add `author_id` FK, backfill from username → id, deprecate `author` string column | 4h |
| #23 | M | `routes/auth.py` | 41 | `login_required` decorator defined inside `routes/auth.py` — cannot be imported cleanly | Internal auth decorator duplication increases risk of divergence between modules | Extract decorator to `utils/auth_decorators.py` (already exists) and import from there; remove local copy | 1h |
| #31 | M | `routes/tasks.py` | 564 | `quick_add_task` does `User.query.filter(User.username.in_(...))` without sanitizing `@` mentions | Unsanitized username lists could cause unexpected query behavior or info leakage | Strip `@` prefix before query; validate each mention resolves to a team member; return 400 on invalid | 1h |
| #37 | M | `routes/tasks.py` | 562 | `quick_add_task` doesn't validate that assignees exist in the current team | Assignment to users outside the team violates multi-tenancy boundaries | Add `team_id` filter to the assignee lookup; reject with `CrossTeamReferenceError` if mismatch | 1h |
| #41 | L | `routes/tasks.py` | 215 | `validate_new_dependency` returns `(msg, status)` tuple instead of raising an exception | Inconsistent error style across routes makes global error handling fragile | Refactor to raise `ValidationError` or a custom exception; let `@register_error_handler` format the response | 1h |
| #47 | L | `routes/filters.py` | 56 | `delete_tag` returns 404 for both "not found" and "not yours" | Ambiguous 404s aid enumeration attackers and frustrate legitimate users | Return 403 for "not yours" to distinguish permission denial from missing resource | 30m |
| #64 | M | `utils/auth_layer.py` | — | Session version bump on team move / role change invalidates all sessions with no grace period | Instant invalidation can drop in-flight requests mid-mutation, causing data inconsistency | Implement a short grace period (e.g., 30s) or use a sliding window; document the trade-off | 2h |
| #71 | L | `app.py` | 147 | `serve_spa` uses `os.path.normpath` — still a potential path traversal risk | SPA static file serving must be bulletproof against `../../etc/passwd` | Replace with `flask.send_from_directory` or whitelist the `frontend/dist` path; add a path-traversal test | 1h |
| #82 | M | `AuthPage.tsx` | 84 | `canShowSignupForm` logic mixes enums — `mode === 'default_team'` shows form without invite token check | Auth flow logic gaps allow registration paths that bypass intended controls | Unify signup flow state machine; add test coverage for each mode transition | 2h |
| #83 | M | `AuthPage.tsx` | 103 | Error handling catches `ApiError` but casts `err.body` as `Record<string, unknown>` without type guard | Unvalidated error payloads can leak internal structure or cause runtime crashes | Add a Zod/io-ts runtime schema for `ApiError.body`; narrow the cast | 1h |
| #120 | M | `OnboardingWizard.tsx` | 60 | `skipProject` sets step 2 directly — may fail if team has no manager role | Onboarding flow assumes a manager exists; this can crash for empty teams | Gate step 2 on `team.members.some(m => m.role === 'manager')`; show fallback invite-only state | 1h |
| #138 | L | `client.ts` | 60 | `clearCsrf` is called on logout but the response may have set a new CSRF cookie — race condition | CSRF token desync after logout → next login may fail with 403 until refresh | Read `Set-Cookie` from logout response and update client token before clearing; or reload page | 1h |

### Cross-reference: roadmap.md Phase 1 — Security
> `roadmap.md` §1.2 (Rate limiting) and §1.3 (Session security) were **resolved** in fix batches. The items above represent gaps not yet covered by those sprints.

---

## Theme 2: Data Integrity & Schema Consistency

*12 items — foundational fixes that prevent cascading bugs.*

| Issue # | Sev | File | Line | Description | Rationale | Fix Approach | Effort |
|---------|-----|------|------|-------------|-----------|--------------|--------|
| #4 | L | `config.py` | 50 | `DEFAULT_ADMIN_RESET_PASSWORD` env var name is redundant | Redundant naming confuses operators and complicates env documentation | Rename to `ADMIN_RESET_PASSWORD_ENABLED` or merge into feature-flag config; update `.env.example` | 30m |
| #9 | M | `models.py` | 165 | `ActivityLog.user_id` FK is nullable but `action` is not; logs without `user_id` have no `username` in `to_dict` | System-generated logs (scheduler, migrations) may have `user_id=None`, breaking `to_dict()` serialization | Add `system` actor default; make `to_dict()` handle `user_id=None` gracefully; or make `action` nullable and add `system_action` label | 1h |
| #10 | L | `models.py` | 29–31 | `task_assignees` table uses `db.Table` with no explicit model | No metadata (assigned_at, assigned_by) on a core business-relationship table | Convert to declarative `TaskAssignee` model with `created_at`; write migration and backfill | 3h |
| #11 | M | `schemas.py` | 28 | `TaskSchema.assignees` uses `data_key='assignee_ids'` — silent breaking change for clients sending objects | API contract drift breaks backward compatibility for older clients | Add `pre_load` hook to accept both `assignees` (object list) and `assignee_ids` (id list); deprecate old field in docs | 2h |
| #12 | M | `schemas.py` | 70 | `SignupSchema.password` error messages are in Polish but schema is used for API validation | Mixed-language error payloads break non-Polish frontend clients and third-party integrations | Move error messages to a translation layer; return `error_code` + `field` and let the frontend localize | 2h |
| #13 | M | `schemas.py` | 86 | `AdminUserCreateSchema` duplicates password validation — DRY violation | Duplicate regex rules drift over time; one change may forget the other | Extract a shared `PasswordValidator` class/function; reuse in both schemas | 1h |
| #14 | L | `schemas.py` | 54 | `ProjectSchema.member_ids` has no minimum length validation | A project with zero members is probably invalid business logic | Add `validate.Length(min=1)` or handle `member_ids=[]` as a deliberate "empty project" case | 30m |
| #15 | L | `schemas.py` | 93 | `AdminUserCreateSchema.role` accepts `"admin"` as legacy alias | Legacy aliases create confusion between `admin` and `manager` | Remove alias; update tests; document role naming convention | 30m |
| #86 | L | `AuthPage.tsx` | 364 | After login/signup, navigates to `'/'` or `'/admin/teams'` with no `?redirect=` parameter check | Users deep-linked to a task page lose their context after auth | Parse `?redirect=` from URL on auth page mount; validate redirect path against allowed routes; use it post-login | 1h |
| #91 | M | `TaskForm.tsx` | 46 | `projectId` state uses `useState` without a setter (unused setter) | Dead code signals incomplete refactoring — may confuse future maintainers | Remove unused setter or wire it up if the form should support project switching | 30m |
| #105 | L | `TasksPage.tsx` | 41 | `BulkUpdates` type uses `Task['priority']` but `BulkTaskUpdatePayload` in `client.ts` uses a different literal | Type drift means the frontend and API types can silently disagree | Centralize `TaskPriority` and `TaskStatus` union types in `types/index.ts`; derive payload types from them | 30m |
| #116 | L | `TaskDetail.tsx` | 192 | `activityLabel` uses a lookup object — missing actions like `dependency_added` fallback to raw action string; not translated | Untranslated activity labels hurt UX for non-Polish users | Add missing actions to the lookup; wire through i18n if available; use enum-driven key mapping | 1h |

---

## Theme 3: Error Handling & Reliability

*30 items — the largest theme. Fixes here prevent user-facing bugs and silent failures.*

| Issue # | Sev | File | Line | Description | Rationale | Fix Approach | Effort |
|---------|-----|------|------|-------------|-----------|--------------|--------|
| #24 | L | `routes/auth.py` | 2 | `import re` at top level but also re-imports `hashlib`, `datetime` inside functions | Redundant imports slow startup and confuse static analysis tools | Move all imports to module top; run `isort` / `ruff` to enforce | 15m |
| #25 | L | `routes/auth.py` | 82 | `target_role = 'user'` always set, then overwritten by `invite.default_role` — unused variable | Dead code reduces readability | Remove the unused assignment; rely on `invite.default_role` directly | 15m |
| #33 | M | `routes/tasks.py` | 610 | `create_task` calls `send_project_activity_emails` **after** commit but `emit_task_event` uses `after_commit` — ordering inconsistency | Email may fire before Socket.IO, or vice versa; race conditions between notification channels | Standardize on a single post-commit hook that sequences email → Socket.IO → audit log | 2h |
| #34 | M | `routes/tasks.py` | 868 | `complete_task` toggles `task.completed` before checking blockers; rollback leaves stale Python state | Flipped state in the Python object may cause downstream logic (e.g., email notification) to use wrong data even after DB rollback | Move blocker check **before** any state mutation; add a test asserting no state change on blocked completion | 1h |
| #42 | L | `routes/tasks.py` | 907 | `get_dependency_board` loads all visible tasks into memory then filters in Python | Unbounded memory use for large teams; scales linearly with task count | Implement SQL-side filtering with `LIMIT`/`OFFSET` or pre-filter visible tasks before Python iteration | 2h |
| #43 | L | `routes/tasks.py` | 1132 | `import_tasks` uses `try/except Exception` broadly — could mask schema errors | Masked schema errors make debugging import failures extremely time-consuming | Replace `except Exception` with specific exceptions; log full traceback server-side; return structured error list with row numbers | 1h |
| #50 | M | `routes/admin.py` | 76 | `_batch_team_resource_counts` queries each resource type separately — 15 queries per batch | Admin dashboard is slow for large team counts; N×15 query pattern | Replace with a single aggregated query using `COUNT(*) FILTER (WHERE ...)` per resource type per team | 3h |
| #51 | M | `routes/admin.py` | 97 | `serialize_team` falls back to `_batch_team_resource_counts` for a single team — still 15 queries | Serialization helper with a hidden N+1 trap | Remove fallback or pass pre-computed counts; never call batch helper for a single object | 1h |
| #55 | L | `routes/admin.py` | 112 | `slugify` uses regex `r"[^a-z0-9]+"` — team names with diacritics become "zesp" | Diacritics are common in team names; data loss on slug creation | Use `python-slugify` or `unicodedata` to transliterate before stripping; add test with Polish team names | 1h |
| #56 | L | `routes/admin.py` | 23 | `unique_slug` name collision resolution is O(n²) worst-case | Slow slug generation for many similarly-named teams | Use a `while` loop with `Team.query.filter_by(slug=...).first()` and a counter; add unique DB index | 1h |
| #61 | L | `utils/email_sender.py` | 46 | `missing_mail_config` returns `[]` when `MAIL_SUPPRESS_SEND=True` | Operators cannot distinguish "mail disabled" from "mail working but no messages" | Return `None` or raise a dedicated exception when mail is suppressed; log at INFO level | 30m |
| #62 | L | `utils/email_sender.py` | 125 | `_line` function returns `None` for empty values — callers must filter | Returning `None` into a list of strings breaks type contracts and surprises callers | Return `""` for empty values; filter empties at the call site if needed; add type hints | 30m |
| #74 | M | `start.sh` | 13 | PostgreSQL wait uses `python3` in a subshell — falls back to 10s fixed sleep if unavailable | Health-check scripts should not depend on runtime being present; Docker images should guarantee it | Replace Python health check with `pg_isready` (bundled with Postgres client); fail fast rather than sleep | 30m |
| #75 | L | `start.sh` | 43 | `--access-logformat` reorders log fields compared to Common Log Format | Non-standard log format breaks ingestion into log aggregators and tooling | Switch to CLF or JSON format; document the format for ops teams | 30m |
| #79 | L | `tests/` | — | No end-to-end test for password reset flow | Password reset is a critical auth path; regressions here lock users out | Add pytest test: request reset → parse email → consume token → verify new password works | 2h |
| #84 | M | `AuthPage.tsx` | 177 | Signup form notice renders inside `isSignup && signupNotice` block, but form is still shown via `canShowSignupForm` — double rendering possible | Double rendering causes layout shifts and potential state desync | Consolidate into a single render branch; derive `showSignupForm` from one source of truth | 1h |
| #85 | M | `AuthPage.tsx` | 219 | Forgot password form has `autoFocus` on email input — conflicts with browser autofill | Autofill + autoFocus fight for cursor control; poor UX | Remove `autoFocus` or delay it until after autofill detection; use `useRef` + `setTimeout` | 30m |
| #88 | L | `AuthPage.tsx` | 90 | `signupInfoLoading` starts as `true` — shows spinner briefly even when no invite/token check needed | Flash of loading state hurts perceived performance | Default to `false`; set `true` only when an async check is actually in flight | 30m |
| #89 | L | `AuthPage.tsx` | 178 | `signupNotice` renders inside the form flow but outside the `<form>` element — validation error containers inconsistent | Inconsistent DOM structure breaks CSS selectors and accessibility | Move `signupNotice` inside the form or use a dedicated `<section>` with role="alert" | 30m |
| #95 | L | `TaskForm.tsx` | 50 | `projects` state is loaded but never refreshed after creating a new task/project | Newly created projects don't appear in the project dropdown until page reload | Invalidate projects cache on create; add `queryClient.invalidateQueries(['projects'])` | 1h |
| #96 | L | `TaskForm.tsx` | 54 | Empty catch block on `fetchProjects` — silently swallows all errors | Silent failures make debugging impossible; user sees empty dropdown with no explanation | Log error via `console.error` or toast; show a retry button | 30m |
| #97 | L | `TaskForm.tsx` | 152 | Calendar icon button uses `input.showPicker()` — not all browsers support this | Firefox and some Safari versions don't support `showPicker()` | Feature-detect `HTMLInputElement.prototype.showPicker` or use a date-picker library as fallback | 1h |
| #100 | M | `TasksPage.tsx` | 111 | `useTasksQuery` hook is imported but local `fetchTasks` is used as fallback — two sources of truth | Dual data paths mean the React Query cache and local state can diverge | Remove local `fetchTasks`; rely entirely on `useTasksQuery` with `refetch` for manual refresh | 2h |
| #101 | M | `TasksPage.tsx` | 175 | `useMemo` for `filteredTasks` double-filters: URL filter + client-side filter — redundant for `q` | Redundant filtering wastes CPU; URL `q` already sent to search API | Remove client-side `q` filter; keep client-side filters only for fields not handled by the API | 1h |
| #102 | M | `TasksPage.tsx` | 188 | `useEffect` prunes `selectedTaskIds` on every `visibleTaskIds` change — drops selections during pagination | Users lose multi-selection when changing pages | Only prune selections on actual data refresh (Socket.IO event), not on pagination | 1h |
| #104 | L | `TasksPage.tsx` | 260 | `undoBulkDelete` uses `window.confirm` — not accessible | `window.confirm` traps focus and is invisible to screen readers | Replace with an accessible `<ConfirmModal>` component; wire through ARIA | 1h |
| #106 | L | `TasksPage.tsx` | 155 | `handleTaskEvent` deps include `fetchTasks` which is recreated on every `addToast` change | Unstable deps cause unnecessary re-subscriptions to Socket.IO events | Memoize `fetchTasks` with `useCallback` or eliminate it in favor of React Query `refetch` | 30m |
| #107 | L | `TasksPage.tsx` | 296 | `handleComplete` calls both `replaceTask` AND `fetchTasks(page)` — double network call | Wastes bandwidth and server CPU; optimistic update + full reload is redundant | Use optimistic update only; rely on Socket.IO for cross-client sync | 30m |
| #108 | L | `TasksPage.tsx` | 191 | `setSelectedTaskIds` in `useEffect` recreates the set for every `prev` — expensive | Set recreation on every pagination event is O(n) for large selections | Filter the set with `Set.difference` or `Array.filter` before creating a new Set | 30m |
| #109 | L | `TasksPage.tsx` | 337 | "To do" summary card uses `pendingCount` from current page only, not all tasks | Dashboard metric is misleading if user is on page 2 of a filtered list | Use dashboard API (`/stats/dashboard`) or fetch total unfiltered count for summary cards | 1h |
| #111 | M | `TaskDetail.tsx` | 83 | `refreshTask` callback depends on `task.id` — deps are stable but misleading | Misleading deps hide the fact that the callback never needs to change | Remove `task.id` from deps array; document why (id is immutable) | 15m |
| #114 | L | `TaskDetail.tsx` | 108 | After update, calls `onClose()` inside `handleUpdateTask` AND `onClose` in `TasksPage` resets detail view — double close | Double close may cause React key warnings or animation glitches | Remove one of the close calls; ensure the parent owns the close lifecycle | 30m |
| #115 | L | `TaskDetail.tsx` | 145 | Notes section condition: `task.notes ? ... : ...` — if notes is `""`, shows "Brak notatek" | Empty string is falsy, so a task with intentionally empty notes shows placeholder | Use `task.notes !== undefined` or `task.notes != null` to distinguish empty from missing | 15m |
| #120 | M | `OnboardingWizard.tsx` | 60 | `skipProject` sets step 2 directly — may fail if team has no manager role | Unsafe state transition assumes manager exists | Validate team has manager before advancing; show invite-only fallback state | 1h |
| #122 | L | `OnboardingWizard.tsx` | 111 | `createTask` sets step 4 even on error | Users think the task was created when it actually failed | Only advance step on successful API response; show error toast on failure | 30m |
| #123 | L | `OnboardingWizard.tsx` | 110 | `quickAddText.trim()` checked but `createTask` is called anyway with empty string | Empty task creation may fail server-side or create ghost tasks | Guard: `if (!quickAddText.trim()) return; showToast('Wpisz nazwę zadania', 'error')` | 15m |
| #127 | L | `SocketContext.tsx` | 26 | `lastTaskEvent` and `lastNotification` are event-driven refs — quick events overwrite before consumer reads | Events can be dropped if two fire within the same render cycle | Use an event queue (array) instead of a single ref; drain queue on each effect run | 1h |
| #128 | L | `SocketContext.tsx` | 27 | `SocketContextType` stores `Socket \| null` — `socketRef.current` may be stale at read time | Stale closures can reference an old socket after reconnection | Expose socket via `useRef` only in the provider; consumers should use event callbacks, not direct socket access | 1h |
| #129 | L | `SocketContext.tsx` | 72 | `data.user !== user?.username` — if `data.user` is undefined, toast still shows | Undefined comparison always evaluates to `true`, causing spurious system notifications | Use strict equality with null check: `if (data.user && data.user !== user?.username)` | 15m |
| #131 | M | `client.ts` | 107 | `request()` throws `ApiError("Błąd sieci", 0, null)` — status code 0 is non-standard | Status 0 confuses error-handling code expecting HTTP codes | Use a dedicated status code (e.g., `NetworkError`) or enum; never expose 0 to consumers | 30m |
| #135 | L | `client.ts` | 203 | `api.auth.signup` and `api.signup.create` are the same endpoint — duplicate | Duplicate API definitions drift over time | Remove one; update all call sites; add a lint rule against duplicate endpoint definitions | 30m |
| #136 | L | `client.ts` | 236 | `api.teams.deleteUser` is nested under `teams` but belongs under `users` semantically | Incorrect nesting confuses API consumers and breaks REST conventions | Move to `api.users.delete` or `api.admin.deleteUser`; update call sites | 30m |
| #137 | L | `client.ts` | 310 | `BulkTaskUpdatePayload` type is a subset of `TaskUpdatePayload` — could use `Partial<TaskPayload>` | Type duplication increases maintenance burden | Derive `BulkTaskUpdatePayload` from `TaskUpdatePayload` or use `Partial<TaskPayload>` with `Pick` | 15m |

---

## Theme 4: Performance & Scalability

*6 items — concentrated in `routes/tasks.py` and `routes/admin.py`.*

| Issue # | Sev | File | Line | Description | Rationale | Fix Approach | Effort |
|---------|-----|------|------|-------------|-----------|--------------|--------|
| #35 | M | `routes/tasks.py` | 376 | `_eager_task_options` loads 7 relationships per task — for `/tasks?per_page=100` this is 700+ SQL rows | Excessive eager loading causes memory bloat and slow JSON serialization for large pages | Introduce a lightweight `TaskListSchema` / `to_list_dict()`; only eager-load fields needed for list view | 3h |
| #42 | L | `routes/tasks.py` | 907 | `get_dependency_board` loads all visible tasks into memory (also in Theme 3) | Same as Theme 3 item — performance angle highlighted here | SQL-side filtering with `Task.status != 'done'` and `LIMIT` before Python processing | 2h |
| #50 | M | `routes/admin.py` | 76 | `_batch_team_resource_counts` queries each resource type separately (also in Theme 3) | Admin endpoints must not scale linearly with resource types | Use a single SQL query with `COUNT(*) FILTER` per type per team | 3h |
| #51 | M | `routes/admin.py` | 97 | `serialize_team` falls back to batch helper for a single team (also in Theme 3) | Single-object serialization must be O(1) | Pre-compute counts in the list query; pass them as a map into `serialize_team()` | 1h |
| #65 | L | `utils/auth_layer.py` | — | Health/ready endpoints whitelisted but still run through `before_request` | Unnecessary DB lookups on every health probe waste resources | Short-circuit `before_request` via `request.path in HEALTH_PATHS` before any DB work | 30m |

---

## Theme 5: Code Quality & Maintainability

*24 items — good-first-issues that improve DX and reduce tech debt.*

| Issue # | Sev | File | Line | Description | Rationale | Fix Approach | Effort |
|---------|-----|------|------|-------------|-----------|--------------|--------|
| #39 | L | `routes/tasks.py` | 8 | `selectinload` imported but `joinedload` also imported — mixed patterns | Mixed loading patterns confuse reviewers and may cause unexpected query plans | Standardize on `selectinload` for to-many; audit all uses of `joinedload` and document exceptions | 30m |
| #40 | L | `routes/tasks.py` | 12 | Comment only, no issue — imports `email_sender` correctly per `AGENTS.md` | This is a false-positive TODO; acknowledge and close | Mark as `WONTFIX` / remove from tracking | 0m |
| #54 | L | `routes/admin.py` | 5 | `import re` but also re-imports `selectinload` at line 89 mid-file | Mid-file imports suggest code was refactored incompletely | Move all imports to module top; run `isort` / `ruff` | 15m |
| #72 | L | `app.py` | 118 | `_log_mail_status` called at startup but also in `create_app` — double logging of same info | Duplicate log lines clutter log aggregation | Call only once in `create_app`; remove from module-level startup block | 15m |
| #94 | L | `TaskForm.tsx` | 62 | `__new__` sentinel value is a magic string | Magic strings are error-prone and hard to refactor | Define `const NEW_PROJECT_SENTINEL = '__new__'` and replace all literals | 15m |
| #108 | L | `TasksPage.tsx` | 191 | `setSelectedTaskIds` in `useEffect` is expensive (also in Theme 3) | Same item, maintainability angle: use functional Set operations | Replace with `setSelectedTaskIds(prev => new Set([...prev].filter(id => visibleTaskIds.has(id))))` | 30m |
| #136 | L | `client.ts` | 236 | `api.teams.deleteUser` under wrong namespace (also in Theme 3) | Same item, maintainability angle: REST convention compliance | Move to `api.users.delete` | 30m |
| #137 | L | `client.ts` | 310 | `BulkTaskUpdatePayload` type duplication (also in Theme 3) | Same item, maintainability angle: DRY types | Derive from `TaskUpdatePayload` | 15m |
| #141 | L | `vite.config.ts` | 3 | `path.resolve(__dirname, './src')` — trailing `/` may cause Windows path issues | Cross-platform path resolution is fragile | Use `path.resolve(__dirname, 'src')` (no trailing slash) or `path.join` | 15m |

> **Note:** Several items in this theme are duplicates of items in other themes (e.g., #42, #50, #51). This is intentional: the same issue often has both a reliability impact and a performance/maintainability impact. The primary assignment is to the most severe theme; maintainability is noted where relevant.

**Additional maintainability-only items not listed above (already covered in primary themes):**
- #12 (Polish-only error messages — i18n)
- #13 (DRY violation — schemas)
- #24 (mid-file imports — auth)
- #25 (unused variable — auth)
- #55 (slugify diacritics — admin)
- #56 (O(n²) slug — admin)
- #86 (redirect param — auth page)
- #87 (redundant signup — auth page)
- #89 (inconsistent layout — auth page)
- #105 (type drift — tasks page)
- #111 (misleading deps — task detail)
- #114 (double close — task detail)
- #116 (untranslated labels — task detail)
- #141 (Windows path — vite config)

---

## Theme 6: Observability & Testing

*4 items — closes the gap on production visibility and test coverage.*

| Issue # | Sev | File | Line | Description | Rationale | Fix Approach | Effort |
|---------|-----|------|------|-------------|-----------|--------------|--------|
| #3 | M | `config.py` | 14 | `normalize_database_uri` has no unit test (also in Theme 1) | Configuration parsing is safety-critical | Add pytest unit tests | 1h |
| #72 | L | `app.py` | 118 | Double logging of mail status (also in Theme 5) | Log noise reduces ops signal-to-noise ratio | Consolidate to single call site | 15m |
| #79 | L | `tests/` | — | No end-to-end password reset test (also in Theme 3) | Critical auth path untested | Add full-flow integration test | 2h |

---

## Theme 7: roadmap.md Phase 1 — Remaining Cross-References

The following `roadmap.md` Phase 1 items were **not addressed** in the committed fix batches and **do not yet appear** as TODOs in `code-review-issues.md`. They are appended here to ensure the hardening plan is complete relative to all planning documents.

| Roadmap § | Item | Status in Code Review | Recommended Action |
|-----------|------|----------------------|--------------------|
| 1.1 | Split `routes/tasks.py` (1,553 lines) into smaller modules | Not in code-review-issues.md | **New work.** Extract `dependencies.py` from `tasks.py`; move `emit_task_event` helpers to `utils/realtime.py`. Effort: 1 day. |
| 1.2 | Rate limiting on `POST /auth/signup`, `/auth/signup-info`, and global mutation burst (30/min) | Partially FIXED (login is done) | Add `@limiter.limit("5 per minute")` to signup/signup-info; add a global mutation limit. Effort: 2h. |
| 1.4 | Test error paths (DB failure, rate limit 429, blocked completion, cross-team bulk ops, token expiry) | Partially covered by #79 | Add dedicated pytest tests for each error path; use `pytest.raises` and mock `OperationalError`. Effort: 1 day. |
| 1.5 | Structured logging & monitoring (`/metrics`, Prometheus, slow query logging, Socket.IO events) | Not in code-review-issues.md | **New work.** Add `prometheus-flask-exporter` for `/metrics`; add `structlog` JSON formatter; log slow queries >500ms. Effort: 1 day. |

### PLAN.md Deferred Features

| # | Feature | Reason | Hardening Plan Stance |
|---|---------|--------|----------------------|
| 10 | Recurring tasks UI | Backend model exists, no API endpoints yet — deferred | **Acknowledged.** Not a security/reliability risk. Defer until feature sprint. |
| 11 | Project templates UI | Skipped per request | **Acknowledged.** Not a security/reliability risk. Defer until feature sprint. |

---

## Implementation Priorities

### 🔴 Sprint A — Security & Data Integrity (14 + 12 = 26 items)
**Effort:** ~3 days  
**Goal:** Close all Medium-severity security and data-integrity gaps.

1. #7, #8 (team scope + comment FK) — highest data-integrity risk
2. #31, #37 (input sanitization + assignee validation) — multi-tenancy boundary
3. #64 (session grace period) — auth reliability
4. #71 (path traversal) — infrastructure security
5. #3, #11, #12, #13 (config + schema consistency)
6. #82, #83, #138 (frontend auth robustness)

### 🟡 Sprint B — Error Handling & Reliability (30 items)
**Effort:** ~4 days  
**Goal:** Eliminate broad `except` clauses, race conditions, and silent failures.

1. #34, #43 (task state + import error handling)
2. #33, #42 (email ordering + dependency board memory)
3. #50, #51 (admin query batching)
4. All frontend state-management fixes (#95–#109, #111–#137)
5. #74, #75 (start.sh robustness)

### 🟢 Sprint C — Performance & Observability (6 + 4 = 10 items)
**Effort:** ~2 days  
**Goal:** Fix remaining N+1s and add production visibility.

1. #35, #42, #50, #51 (query optimization)
2. #65 (auth layer short-circuit)
3. #72, #79 (logging + testing)
4. roadmap.md §1.5 structured logging (new work)

### ⚪ Sprint D — Code Quality & Polish (24 items)
**Effort:** ~2 days  
**Goal:** Good-first-issues and DX improvements.

1. All Low-severity import hygiene, type drift, and translation gaps
2. Remove magic strings, DRY violations, unused variables
3. Standardize error style (#41)

---

## Tracking Migration Guide

If you are updating from `docs/code-review-issues.md`:

| Old Location | New Location | Notes |
|--------------|--------------|-------|
| `docs/code-review-issues.md` | ⛔ **Superseded** | Do not add new issues here |
| #1–#2 (config.py CRITICAL) | ✅ FIXED | Resolved in fix batches |
| #5–#6 (models.py CRITICAL/HIGH) | ✅ FIXED / WONTFIX | Resolved in fix batches |
| #16–#18, #20–#22 (routes/auth.py HIGH/MEDIUM) | ✅ FIXEDv2 | Resolved in fix batches |
| #26–#30, #32, #36, #38 (routes/tasks.py CRITICAL/HIGH/MEDIUM) | ✅ FIXED / FIXEDv2 | Resolved in fix batches |
| #44–#46 (routes/filters.py CRITICAL/MEDIUM) | ✅ FIXED | Resolved in fix batches |
| #48–#49, #52–#53 (routes/admin.py CRITICAL/HIGH/MEDIUM) | ✅ FIXED / FIXEDv2 | Resolved in fix batches |
| #57–#60, #63 (utils/email_sender + auth_layer) | ✅ FIXED / FIXEDv2 | Resolved in fix batches |
| #66–#70 (app.py CRITICAL/HIGH/MEDIUM) | ✅ FIXED / FIXEDv2 | Resolved in fix batches |
| #73 (start.sh CRITICAL) | ✅ FIXED | Resolved in fix batches |
| #76–#78 (tests HIGH/MEDIUM) | ✅ FIXED | Resolved in fix batches |
| #80–#81, #90, #92–#93, #98–#99, #103, #110, #112–#113, #117, #118–#119, #121, #124–#126, #130, #132–#134, #139–#140 (frontend) | ✅ FIXED / FIXEDv2 | Resolved in fix batches |
| **All remaining TODOs** | **This document (Theme 1–6)** | 78 items prioritized and categorized |

---

*End of Hardening Plan*
