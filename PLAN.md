# TaskMaster2 — Proposed Upgrades & Optimizations

## 🔴 Critical Bugs (Fix Now)

| # | Issue | Location | Why |
|---|---|---|---|
| 1 | **Assignee validation race condition** — `len(value) > 1` check runs *after* `update_task_assignees` mutates the task | `routes/tasks.py:768-772` | A valid multi-assignee payload bypasses the single-assignee guard |
| 2 | **Silent email failure on forgot-password** — catches exception, logs, then returns 200 "success" | `routes/auth.py:188` | User is told "email sent" when SMTP is down — trust-breaking UX |
| 3 | **Bare `except Exception` in app.py** — catches `SystemExit`, `KeyboardInterrupt` | `app.py:105,112,145,210` | Could mask fatal signals during deployment |

## 🟡 Performance (High Impact)

| # | Issue | Location | Impact |
|---|---|---|---|
| 4 | **`/stats/dashboard` loads ALL tasks** into memory for aggregation | `routes/stats.py:45-66` | O(n) Python loops over 10K+ tasks, no pagination |
| 5 | **`/projects` has N+1 on task serialization** — no eager loading | `routes/projects.py:90-93` | Each project's task list triggers 10+ extra queries |
| 6 | **`Task.to_dict()` is extremely heavy** — serializes all nested relationships every time | `models.py:149-170` | ~50 DB calls per page of 24 tasks without `_eager_task_options` |
| 7 | **`/tasks/filter`, `/search`, `/by-project` have no pagination** — `.all()` only | `routes/tasks.py:1116-1150` | 5000-result queries loaded into memory |

## 🟢 New Features (User-Visible)

| # | Feature | Why |
|---|---|---|
| 8 | **Task detail route** `/tasks/:id` | Current modal-only approach breaks URL sharing, back button, and deep linking |
| 9 | **User settings page** | No way to change password, email, notification prefs after login |
| 10 | **Recurring tasks UI** | Backend model exists (`RecurringTask`) — no frontend to configure it |
| 11 | **Project templates UI** | Backend has `ProjectTemplate` + seed catalogue — no frontend |
| 12 | **Undo delete with toast** | Hard-delete is irreversible; soft-delete + 5-second undo is industry standard |
| 13 | **Dark mode on auth pages** | Theme is only applied inside `DashboardLayout` — login/signup is always light |
| 14 | **Bulk action bar UI** | Backend supports bulk complete/delete/update, but frontend has no multi-select UX |

## 🔵 Code Quality & DX

| # | Change | Location |
|---|---|---|
| 15 | **Replace `npm install` with `npm ci`** in Dockerfile for deterministic builds | `Dockerfile:10` |
| 16 | **Use explicit imports** instead of `from routes.auth import *` | `routes/__init__.py:13-21` |
| 17 | **Add granular React Query key invalidation** — comment addition shouldn't refetch dashboard stats | `frontend/` query hooks |
| 18 | **Fix `api/client.ts` network error handling** — unhandled fetch rejections bypass `ApiError` | `frontend/src/api/client.ts:196-200` |
| 19 | **Add `ENV FLASK_ENV=production`** to Dockerfile — default in config.py is `development` | `Dockerfile` |

## 🟣 Security

| # | Improvement | Location |
|---|---|---|
| 20 | **Validate cross-team on assignee_ids** — reject users with `team_id=None` (super_admin) from being assigned | `routes/tasks.py:232-233` |
| 21 | **Add password complexity requirements** (uppercase, digit, special char) | `routes/auth.py:206-209` |

## 📋 Testing Gaps

| # | Untested Endpoint | File |
|---|---|---|
| 22 | `PUT /admin/users/<id>/team` (team move) | `routes/admin.py:502` |
| 23 | `PUT /admin/users/<id>/role` (role change) | `routes/admin.py:556` |
| 24 | `POST /tasks/import` | `routes/tasks.py:1264` |
| 25 | `GET /tasks/export` (JSON format) | `routes/tasks.py:1241` |
| 26 | `DELETE /tasks/<id>/dependencies` | `routes/tasks.py:537` |
| 27 | Multi-hop dependency cycles (A→B→C→A) | `routes/tasks.py:156` |
