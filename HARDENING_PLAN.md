# TaskMaster2 — Security Hardening Plan

> **Generated:** 2026-06-14  
> **Scope:** Security vulnerabilities and hardening todos identified through code review and audit.  
> **Status:** Live document — items are prioritized for implementation.

---

## Executive Summary

Security audit identified **12 actionable security items** across the codebase. Items are organized by severity and implementation priority. All items are actionable without breaking existing functionality.

---

## 🔴 Critical Security Items (None)

No critical vulnerabilities confirmed. SQL injection and XSS risks are mitigated by SQLAlchemy ORM and React's default escaping.

---

## 🟠 High Severity Security Items (4)

### H1. Socket.IO Session Not Invalidated by `session_version`

**File:** `utils/realtime.py`  
**Impact:** After password reset, logout-all, team move, role change, or team archive, existing Socket.IO connections remain active and continue receiving events.  
**Fix:** Add `session_version` check in `socket_connect_handler()`. On mismatch, reject connection or disconnect existing sockets.

### H2. Password Reset Does Not Invalidate Sessions

**File:** `routes/auth.py` (password reset flow)  
**Impact:** Compromised reset tokens leave existing sessions valid after password change.  
**Fix:** Bump `user.session_version` after successful password reset. Clear the current session and force re-authentication.

### H3. Cross-Team Assignee Validation Gaps

**File:** `routes/tasks.py` (`quick_add_task`)  
**Impact:** Unsanitized `@username` mentions and assignee lookups could assign tasks to users outside the current team.  
**Fix:** Strip `@` prefix before query; validate each mention resolves to a team member; reject with `CrossTeamReferenceError` if mismatch.

### H4. Comment Model Missing User FK

**File:** `models.py`  
**Impact:** Renaming a user breaks comment authorship history; prevents efficient join queries.  
**Fix:** Add `author_id` FK to Comment model; migration to backfill from existing `author` string; deprecate string column.

---

## 🟡 Medium Severity Security Items (5)

### M1. ProxyFix Trust Configuration

**File:** `app.py`  
**Impact:** Unconditional `ProxyFix` trust could allow header spoofing if Flask is exposed directly.  
**Fix:** Gate `ProxyFix` behind `FLASK_ENV=production` check or bind to known proxy subnet.

### M2. Task Import Endpoint Validation

**File:** `routes/tasks.py` (`/tasks/import`)  
**Impact:** Malformed project data can cause unhandled exceptions.  
**Fix:** Validate full import payload with Marshmallow schema before DB mutations.

### M3. Profile Update Lacks Validation

**File:** `routes/auth.py` (`PUT /auth/me`)  
**Impact:** Empty/invalid email or values can cause DB errors.  
**Fix:** Add `ProfileUpdateSchema` with email validation and explicit allowed fields.

### M4. Session Version Bump Without Grace Period

**File:** `utils/auth_layer.py`  
**Impact:** Instant invalidation can drop in-flight requests mid-mutation.  
**Fix:** Implement 30-second grace period or sliding window for session invalidation.

### M5. Path Traversal Risk in SPA Serving

**File:** `app.py` (`serve_spa`)  
**Impact:** `os.path.normpath` may still allow path traversal attacks.  
**Fix:** Replace with `flask.send_from_directory` or whitelist `frontend/dist` path; add path-traversal tests.

---

## 🟢 Low Severity Security Items (3)

### L1. Bootstrap/Admin Password Defaults

**File:** `.env.example`, `config.py`  
**Impact:** Weak default passwords increase risk if not changed on first deploy.  
**Fix:** Remove hardcoded bootstrap password from examples; require random bootstrap password on first deploy.

### L2. Session Fixation on Login

**File:** `routes/auth.py` (`_establish_session`)  
**Impact:** Session not cleared before establishing new session.  
**Fix:** Call `session.clear()` before `_establish_session()` on login/signup.

### L3. CSP Allows Inline Styles

**File:** `app.py`  
**Impact:** `style-src 'self' 'unsafe-inline'` weakens CSP.  
**Fix:** Consider nonce-based styles or remove inline React styles; this is a known tradeoff for Tailwind.

---

## Implementation Priority

### Sprint 1 — Authentication Security (H1, H2, L1, L2)
**Effort:** ~2 days

1. Implement Socket.IO session_version validation (H1)
2. Fix password reset session invalidation (H2)
3. Remove weak bootstrap defaults (L1)
4. Add session.clear() on login (L2)

### Sprint 2 — Authorization & Input Security (H3, M3, M4)
**Effort:** ~2 days

1. Fix cross-team assignee validation (H3)
2. Add profile update schema validation (M3)
3. Implement session grace period (M4)

### Sprint 3 — Infrastructure Security (M1, M2, M5)
**Effort:** ~1 day

1. Secure ProxyFix configuration (M1)
2. Add task import validation (M2)
3. Fix SPA path traversal (M5)

---

## Already Addressed

The following security items are already implemented correctly:

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