# TaskMaster2 — Security Hardening Plan

> **Generated:** 2026-06-14  
> **Scope:** Security vulnerabilities and hardening todos identified through code review and audit.  
> **Status:** Items marked with ✅ are completed.

---

## Executive Summary

Security audit identified **12 actionable security items** across the codebase. Sprint 1 focused on authentication security, Sprint 2 on authorization input validation, and Sprint 3 on infrastructure hardening.

---

## 🔴 Critical Security Items (None)

No critical vulnerabilities confirmed. SQL injection and XSS risks are mitigated by SQLAlchemy ORM and React's default escaping.

---

## 🟠 High Severity Security Items (4)

### ✅ H1. Socket.IO Session Not Invalidated by `session_version`

**File:** `utils/realtime.py`  
**Impact:** After password reset, logout-all, team move, role change, or team archive, existing Socket.IO connections remain active and continue receiving events.  
**Fix:** Added `session_version` check in `socket_connect_handler()`. On mismatch, connection is rejected.

### ✅ H2. Password Reset Does Not Invalidate Sessions

**File:** `routes/auth.py` (password reset flow)  
**Impact:** Compromised reset tokens leave existing sessions valid after password change.  
**Fix:** Added `user.session_version += 1` after successful password reset.

### ✅ H3. Cross-Team Assignee Validation Gaps

**File:** `routes/tasks.py` (`quick_add_task`)  
**Impact:** Unsanitized `@username` mentions and assignee lookups could assign tasks to users outside the current team.  
**Fix:** Already implemented - assignee lookup filters by `User.team_id == g.get('current_team_id')` at line 664.

### H4. Comment Model Missing User FK

**File:** `models.py`  
**Impact:** Renaming a user breaks comment authorship history; prevents efficient join queries.  
**Fix:** Add `author_id` FK to Comment model; migration to backfill from existing `author` string; deprecate string column.
**Status:** Deferred - requires schema migration.

---

## 🟡 Medium Severity Security Items (5)

### ✅ M1. ProxyFix Trust Configuration

**File:** `app.py`  
**Impact:** Unconditional `ProxyFix` trust could allow header spoofing if Flask is exposed directly.  
**Fix:** Gated `ProxyFix` behind `FLASK_ENV=production` check.

### M2. Task Import Endpoint Validation

**File:** `routes/tasks.py` (`/tasks/import`)  
**Impact:** Malformed project data can cause unhandled exceptions.  
**Fix:** Validate full import payload with Marshmallow schema before DB mutations.  
**Status:** Partially addressed - project names are validated, but full schema validation recommended for robustness.

### ✅ M3. Profile Update Lacks Validation

**File:** `routes/auth.py` (`PUT /auth/me`)  
**Impact:** Empty/invalid email or values can cause DB errors.  
**Fix:** Added `ProfileUpdateSchema` with email validation and explicit allowed fields.

### M4. Session Version Bump Without Grace Period

**File:** `utils/auth_layer.py`  
**Impact:** Instant invalidation can drop in-flight requests mid-mutation.  
**Fix:** Implement 30-second grace period or sliding window for session invalidation.  
**Status:** Deferred - current instant invalidation is acceptable for most use cases.

### ✅ M5. Path Traversal Risk in SPA Serving

**File:** `app.py` (`serve_spa`)  
**Impact:** `os.path.normpath` may still allow path traversal attacks.  
**Fix:** Path traversal protection already exists via `candidate.startswith(os.path.abspath(app.static_folder))` check.

---

## 🟢 Low Severity Security Items (3)

### ✅ L1. Bootstrap/Admin Password Defaults

**File:** `.env.example`, `config.py`  
**Impact:** Weak default passwords increase risk if not changed on first deploy.  
**Fix:** Removed hardcoded bootstrap password from `.env.example`; added warning comment.

### ✅ L2. Session Fixation on Login

**File:** `routes/auth.py` (`_establish_session`)  
**Impact:** Session not cleared before establishing new session.  
**Fix:** Added `session.clear()` before `_establish_session()` on login/signup.

### ✅ L3. CSP Allows Inline Styles

**File:** `app.py`  
**Impact:** `style-src 'self' 'unsafe-inline'` weakens CSP.  
**Fix:** Documented as known tradeoff for Tailwind CSS inline styles.

---

## Already Addressed

The following security items are already implemented correctly in the codebase:

- ✅ CSRF protection via Flask-WTF with token rotation
- ✅ Password hashing via Werkzeug (scrypt)
- ✅ Secure cookie flags: HttpOnly, SameSite=Lax, Secure in production
- ✅ Session version invalidation on team move/role change/archive
- ✅ Team-scoped queries via `team_scoped()` and `get_team_resource_or_404()`
- ✅ Security headers: HSTS, X-Frame-Options, X-Content-Type-Options
- ✅ No hardcoded secrets in production code
- ✅ No direct file upload handling

---

*End of Security Hardening Plan*

---

## 🔄 Recent Feature: Auto-Archive Completed Tasks

**Behavior:** Tasks marked as done are automatically archived after 3 days.  
**Migration:** New `completed_at` column on Task model.  
**Scheduler job:** `archive_completed_tasks` runs daily.  
**API:** Archived tasks are filtered from `visible_task_query()` results.