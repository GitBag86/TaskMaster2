# TaskMaster2 — Proposed Upgrades & Optimizations

## ✅ Completed (Batch 1 — Bugfixes & Performance)

| # | Item | Status |
|---|---|---|
| 1 | **Assignee validation race condition** — reviewed, check correctly precedes mutation | ⚠️ No fix needed |
| 2 | **Silent email failure on forgot-password** — improved logging + comment | ✅ |
| 3 | **Bare `except Exception` in app.py** — narrowed to `(FileNotFoundError, OSError, SQLAlchemyError)` | ✅ |
| 4 | **`/stats/dashboard` aggregation** — replaced O(n) Python loops with DB-level COUNT/GROUP BY | ✅ |
| 5 | **`/projects` N+1** — added `_eager_project_options()` with selectinload chains | ✅ |
| 6 | **Heavy `Task.to_dict()`** — mitigated by eager loading; `summary_dict()` already exists | ✅ |
| 7 | **Pagination for filter/search/by-project** — added page/per_page params | ✅ |
| 24 | **`POST /tasks/import` tests** — happy path, duplicate project, missing titles | ✅ |
| 25 | **`GET /tasks/export` JSON tests** — already covered | ✅ |
| 26 | **`DELETE /dependencies/<id>` test** — already covered | ✅ |
| 27 | **Multi-hop dependency cycle** (A→B→C→A) | ✅ |
| 22/23 | **Admin role/team move tests** — already covered in test_admin_endpoints.py | ✅ |

## ✅ Completed (Batch 2 — Features)

| # | Feature | Why | Status |
|---|---|---|---|
| 8 | **Task detail route** `/tasks/:id` | Current modal-only approach breaks URL sharing, back button, and deep linking | ✅ |
| 9 | **User settings page** | No way to change password, email, notification prefs after login | ✅ |
| 12 | **Undo delete with toast** | Hard-delete is irreversible; soft-delete + 5-second undo is industry standard | ✅ |
| 13 | **Dark mode on auth pages** | Theme is only applied inside `DashboardLayout` — login/signup is always light | ✅ |
| 14 | **Bulk action bar UI** | Backend supports bulk complete/delete/update — frontend already has multi-select UX | ✅ (pre-existing) |

## ✅ Completed (Batch 3 — Code Quality, DX, Security)

| # | Change | Status |
|---|---|---|
| 15 | **Replace `npm install` with `npm ci`** in Dockerfile for deterministic builds | ✅ |
| 16 | **Use explicit imports** instead of `from routes.auth import *` | ✅ |
| 17 | **Add granular React Query key invalidation** — skipped (no React Query usage in app code) | ⏭️ |
| 18 | **Fix `api/client.ts` network error handling** — unhandled fetch rejections now throw ApiError | ✅ |
| 19 | **Add `ENV FLASK_ENV=production`** to Dockerfile | ✅ |
| 20 | **Validate cross-team on assignee_ids** — reject users with `team_id=None` from being assigned | ✅ (pre-existing) |
| 21 | **Add password complexity requirements** (uppercase, digit, special char) | ✅ |

## ⬜ Not Implemented

| # | Item | Reason |
|---|---|---|
| 10 | **Recurring tasks UI** | Backend model exists, no API endpoints yet — deferred |
| 11 | **Project templates UI** | Skipped per request |
