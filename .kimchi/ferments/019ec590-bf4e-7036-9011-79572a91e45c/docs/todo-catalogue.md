# TODO Catalogue — 78 Remaining Issues

Extracted from `docs/code-review-issues.md` (generated 2026-06-13).

## Summary by Severity
| Severity | Count |
|----------|-------|
| Medium   | 28    |
| Low      | 50    |
| **Total**    | **78**    |

## Summary by Area
| Area | Count |
|------|-------|
| Backend (Python) | 29 |
| Frontend (TypeScript) | 37 |
| Config / Infra | 5 |
| Email | 2 |
| Tests | 1 |
| **Total** | **78** |

## Backend (Python) — 29 items

### Config (2)
| # | Sev | File | Line | Description |
|---|-----|------|------|-------------|
| 3 | M | config.py | 14 | `normalize_database_uri` has no unit test; edge case with `postgres://` + query params not covered |
| 4 | L | config.py | 50 | `DEFAULT_ADMIN_RESET_PASSWORD` env var name is redundant |

### Models (4)
| # | Sev | File | Line | Description |
|---|-----|------|------|-------------|
| 7 | M | models.py | 91-94 | `open_dependency_tasks` and `open_dependent_tasks` ignore team scope |
| 8 | M | models.py | 142 | `Comment.author` stores plain username string instead of FK to `User` |
| 9 | M | models.py | 165 | `ActivityLog.user_id` FK is nullable but `action` is not; logs without user_id have no `username` in to_dict |
| 10 | L | models.py | 29-31 | `task_assignees` table uses `db.Table` with no explicit model — no `created_at` or `assigned_by` metadata |

### Schemas (5)
| # | Sev | File | Line | Description |
|---|-----|------|------|-------------|
| 11 | M | schemas.py | 28 | `TaskSchema.assignees` uses `data_key='assignee_ids'` — silent breaking change for old clients |
| 12 | M | schemas.py | 70 | `SignupSchema.password` error messages are in Polish but schema is used for API validation |
| 13 | M | schemas.py | 86 | `AdminUserCreateSchema` duplicates password validation — DRY violation |
| 14 | L | schemas.py | 54 | `ProjectSchema.member_ids` has no minimum length validation |
| 15 | L | schemas.py | 93 | `AdminUserCreateSchema.role` accepts `"admin"` as a legacy alias — never exposed in docs |

### routes/auth.py (3)
| # | Sev | File | Line | Description |
|---|-----|------|------|-------------|
| 19 | M | routes/auth.py | 93 | `SignupSchema` fields `accept_terms`, `accept_privacy` error msg hardcoded in PL |
| 23 | M | routes/auth.py | 41 | `login_required` decorator defined inside module — circular import risk |
| 24 | L | routes/auth.py | 2 | `import re` at top level but also re-imports `hashlib`, `datetime` inside functions |
| 25 | L | routes/auth.py | 82 | `target_role = 'user'` always set, then overwritten by invite.default_role — unused variable |

### routes/tasks.py (10)
| # | Sev | File | Line | Description |
|---|-----|------|------|-------------|
| 31 | M | routes/tasks.py | 564 | `quick_add_task` does `User.query.filter(User.username.in_(...))` without sanitizing input |
| 33 | M | routes/tasks.py | 610 | `create_task` calls `send_project_activity_emails` after commit but `emit_task_event` calls `after_commit` — ordering inconsistency |
| 34 | M | routes/tasks.py | 868 | `complete_task` toggles `task.completed` then checks blocks — status flipped in Python object before rollback |
| 35 | M | routes/tasks.py | 376 | `_eager_task_options` loads 7 relationships per task — for `/tasks?per_page=100` this is 700+ SQL rows |
| 37 | M | routes/tasks.py | 562 | `quick_add_task` doesn't validate that `assignees` exist in the current team |
| 39 | L | routes/tasks.py | 8 | `selectinload` imported but `joinedload` also imported — mixed patterns |
| 40 | L | routes/tasks.py | 12 | Comment only, no issue — imports `email_sender` correctly per AGENTS.md |
| 41 | L | routes/tasks.py | 215 | `validate_new_dependency` returns `(msg, status)` tuple instead of raising an exception — inconsistent error style |
| 42 | L | routes/tasks.py | 907 | `get_dependency_board` loads all visible tasks into memory then filters in Python |
| 43 | L | routes/tasks.py | 1132 | `import_tasks` uses `try/except Exception` broadly — could mask schema errors |

### routes/filters.py (1)
| # | Sev | File | Line | Description |
|---|-----|------|------|-------------|
| 47 | L | routes/filters.py | 56 | `delete_tag` returns 404 for both "not found" and "not yours" |

### routes/admin.py (5)
| # | Sev | File | Line | Description |
|---|-----|------|------|-------------|
| 50 | M | routes/admin.py | 76 | `_batch_team_resource_counts` queries each resource type separately — 15 queries per batch |
| 51 | M | routes/admin.py | 97 | `serialize_team` calls `_batch_team_resource_counts` again as fallback — still runs 15 queries |
| 54 | L | routes/admin.py | 5 | `import re` but also re-imports `selectinload` at line 89 mid-file |
| 55 | L | routes/admin.py | 112 | `slugify` uses regex `r"[^a-z0-9]+"` — team names with diacritics become truncated |
| 56 | L | routes/admin.py | 23 | `unique_slug` name collision resolution is O(n^2) worst-case |

### utils/email_sender.py (2)
| # | Sev | File | Line | Description |
|---|-----|------|------|-------------|
| 61 | L | utils/email_sender.py | 46 | `missing_mail_config` returns `[]` when `MAIL_SUPPRESS_SEND=True` — false sense of working email |
| 62 | L | utils/email_sender.py | 125 | `_line` function returns `None` for empty values — callers must filter |

### utils/auth_layer.py (2)
| # | Sev | File | Line | Description |
|---|-----|------|------|-------------|
| 64 | M | utils/auth_layer.py | — | Session version bump on `team_move` / `role_change` invalidates all sessions — no grace period for in-flight requests |
| 65 | L | utils/auth_layer.py | — | Health/ready endpoints are whitelisted from auth but also run through `before_request` — minor perf issue |

### app.py (2)
| # | Sev | File | Line | Description |
|---|-----|------|------|-------------|
| 71 | L | app.py | 147 | `serve_spa` uses `os.path.normpath` + check — still a potential path traversal risk (mitigated by `os.path.isfile` check) |
| 72 | L | app.py | 118 | `_log_mail_status` called at startup but also in `create_app` — double logging |

### start.sh (2)
| # | Sev | File | Line | Description |
|---|-----|------|------|-------------|
| 74 | M | start.sh | 13 | PostgreSQL wait uses `python3` in a subshell — if `python3` is not available, falls back to fixed 10s sleep |
| 75 | L | start.sh | 43 | `--access-logformat` reorders log fields compared to Common Log Format |

### Tests (1)
| # | Sev | File | Line | Description |
|---|-----|------|------|-------------|
| 79 | L | tests/ | — | No test for password reset flow end-to-end (email generation, link parsing, token consumption) |

## Frontend (TypeScript) — 37 items

### AuthPage.tsx (9)
| # | Sev | File | Line | Description |
|---|-----|------|------|-------------|
| 82 | M | AuthPage.tsx | 84 | `canShowSignupForm` logic mixes enums — `mode === 'default_team'` shows form without invite token check |
| 83 | M | AuthPage.tsx | 103 | Error handling catches `ApiError` but also `Error` — `ApiError` branch casts `err.body` without type guard |
| 84 | M | AuthPage.tsx | 177 | Signup form notice renders inside `isSignup && signupNotice` block — but form is still shown via `canShowSignupForm` — double rendering possible |
| 85 | M | AuthPage.tsx | 219 | Forgot password form has `autoFocus` on email input — conflicts with browser autofill |
| 86 | L | AuthPage.tsx | 364 | After successful login/signup, navigates to `'/'` or `'/admin/teams'` — no `?redirect=` parameter check |
| 87 | L | AuthPage.tsx | 106 | `signup` function called from `useAuth()` — but also `api.signup.create` exists in client.ts (redundant) |
| 88 | L | AuthPage.tsx | 90 | `signupInfoLoading` starts as `true` — shows spinner briefly even when no invite/token check needed |
| 89 | L | AuthPage.tsx | 178 | `signupNotice` renders inside the form flow but outside the `<form>` element — validation error containers are inconsistent |

### TaskForm.tsx (6)
| # | Sev | File | Line | Description |
|---|-----|------|------|-------------|
| 91 | M | TaskForm.tsx | 46 | `projectId` state uses `useState` without setter (unused setter) |
| 94 | L | TaskForm.tsx | 62 | `__new__` sentinel value is a magic string — should be a constant |
| 95 | L | TaskForm.tsx | 50 | `projects` state is loaded but never refreshed after creating a new task/project |
| 96 | L | TaskForm.tsx | 54 | Empty catch block on `fetchProjects` — silently swallows all errors |
| 97 | L | TaskForm.tsx | 152 | Calendar icon button uses custom `openDueDatePicker()` — not all browsers support `input.showPicker()` |

### TasksPage.tsx (10)
| # | Sev | File | Line | Description |
|---|-----|------|------|-------------|
| 100 | M | TasksPage.tsx | 111 | `useTasksQuery` hook is imported but the local `fetchTasks` is used as fallback — two sources of truth |
| 101 | M | TasksPage.tsx | 175 | `useMemo` for `filteredTasks` double-filters: URL filter + client-side filter — redundant |
| 102 | M | TasksPage.tsx | 188 | `useEffect` for cleanup prunes `selectedTaskIds` on every `visibleTaskIds` change — may drop selections during pagination |
| 104 | L | TasksPage.tsx | 260 | `undoBulkDelete` uses `window.confirm` — not accessible; should use a modal |
| 105 | L | TasksPage.tsx | 41 | `BulkUpdates` type uses `Task['priority']` but `BulkTaskUpdatePayload` in client.ts uses literal — type drift |
| 106 | L | TasksPage.tsx | 155 | `handleTaskEvent` deps include `fetchTasks` which is recreated on every `addToast` change |
| 107 | L | TasksPage.tsx | 296 | `handleComplete` calls both `replaceTask` AND `fetchTasks(page)` — double network call |
| 108 | L | TasksPage.tsx | 191 | `setSelectedTaskIds` in `useEffect` uses `prev =>` but the function is recreating the set for every `prev` — expensive |
| 109 | L | TasksPage.tsx | 337 | "To do" summary card uses `pendingCount` from `tasks.length - completedCount` — but tasks are only 1 page, not all tasks |

### TaskDetail.tsx (4)
| # | Sev | File | Line | Description |
|---|-----|------|------|-------------|
| 111 | M | TaskDetail.tsx | 83 | `refreshTask` callback depends on `task.id` — deps are stable but misleading |
| 114 | L | TaskDetail.tsx | 108 | After update, calls `onClose()` inside `handleUpdateTask` AND `onClose` in TasksPage probably resets detail view — double close |
| 115 | L | TaskDetail.tsx | 145 | Notes section condition: `task.notes ? ... : ...` — if notes is `""`, shows "Brak notatek" |
| 116 | L | TaskDetail.tsx | 192 | `activityLabel` uses a lookup object — missing actions like `dependency_added` fallback to raw action string; not translated |

### OnboardingWizard.tsx (3)
| # | Sev | File | Line | Description |
|---|-----|------|------|-------------|
| 120 | M | OnboardingWizard.tsx | 60 | `skipProject` sets step 2 directly — step 2 shows invite link generation, which may fail if team has no manager role |
| 122 | L | OnboardingWizard.tsx | 111 | `createTask` sets step 4 even on error — user doesn't know if task was created |
| 123 | L | OnboardingWizard.tsx | 110 | `quickAddText.trim()` is checked but `createTask` is called anyway with empty string — just advances to step 4 |

### SocketContext.tsx (3)
| # | Sev | File | Line | Description |
|---|-----|------|------|-------------|
| 127 | L | SocketContext.tsx | 26 | `lastTaskEvent` and `lastNotification` are event-driven refs passed through context — if two events fire quickly, the 2nd overwrites before the consumer reads |
| 128 | L | SocketContext.tsx | 27 | `SocketContextType` stores `Socket | null` — but `socketRef.current` may be stale at read time (closure issue) |
| 129 | L | SocketContext.tsx | 72 | `data.user !== user?.username` comparison — if `data.user` is undefined, the toast still shows |

### client.ts (6)
| # | Sev | File | Line | Description |
|---|-----|------|------|-------------|
| 131 | M | client.ts | 107 | `request()` function catches network errors and throws `ApiError("Błąd sieci", 0, null)` — status code 0 is non-standard |
| 135 | L | client.ts | 203 | `api.auth.signup` and `api.signup.create` are the same endpoint — duplicate |
| 136 | L | client.ts | 236 | `api.teams.deleteUser` is nested under `teams` but belongs under `users` semantically |
| 137 | L | client.ts | 310 | `BulkTaskUpdatePayload` type definition is a subset of `TaskUpdatePayload` — could use `Partial<TaskPayload>` |
| 138 | L | client.ts | 60 | `clearCsrf` is called on logout but the response may have set a new CSRF cookie — race condition |

### vite.config.ts (1)
| # | Sev | File | Line | Description |
|---|-----|------|------|-------------|
| 141 | L | vite.config.ts | 3 | `path.resolve(__dirname, './src')` — `/` at the end may cause subtle path resolution differences on Windows |
