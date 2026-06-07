# TaskMaster2 — Development Roadmap

**Harden · Optimize · Polish**

A prioritized plan to make TaskMaster2 more secure, performant, and delightful to use.

**Codebase:** ~11,400 lines Python, ~8,960 lines TypeScript/TSX  
**Tests:** 220 backend + 18 frontend (all passing)  
**Deployment:** Railway, PostgreSQL (prod) / SQLite (dev)

---

## 🔴 PHASE 1: HARDENING

### 1.1 Split `routes/tasks.py` (1,553 lines → smaller modules)

**Problem:** One file handles tasks, projects, dependencies, comments, emails — violates single responsibility principle.

| Action | Target |
|---|---|
| Extract project CRUD | → `routes/projects.py` |
| Extract dependency management | → `routes/dependencies.py` |
| Move email/notification helpers | → `utils/email_sender.py` (already partially there) |
| Move `emit_task_event()`, `emit_team_event()` | → `utils/realtime.py` |

**Risk:** Low. Pure refactor — route prefixes stay the same, all tests should pass unchanged.

### 1.2 Rate limiting on auth endpoints

Flask-Limiter is already installed. Add missing decorators:

| Endpoint | Limit |
|---|---|
| `POST /auth/login` | 5 per minute (already done) |
| `POST /auth/signup` | 5 per minute |
| `POST /auth/signup-info` | 10 per minute |
| All mutation endpoints (global) | 30 per minute burst |

### 1.3 Session security hardening

| Issue | Fix |
|---|---|
| No session TTL | Add `PERMANENT_SESSION_LIFETIME = timedelta(hours=24)` |
| Dev default SECRET_KEY | Log startup warning if `SECRET_KEY` is the dev default |
| No force-logout-all | `POST /auth/logout-all` bumps `session_version` |
| No CSRF protection for state-changing endpoints | Add Flask-WTF or custom token header validation |

### 1.4 Test error paths

The test suite has zero tests for database error scenarios:

- `OperationalError` on DB connection failure
- `IntegrityError` on constraint violation
- Rate-limited endpoint returns 429
- Blocked task completion with multiple blockers
- Cross-team reference on every bulk operation
- Token expiry / consumption edge cases

### 1.5 Structured logging & monitoring

```
GET /metrics → Prometheus-style endpoint
  ↓
Track: request count, p50/p95/p99 latency, error rate,
       Socket.IO connections, active users per team
```

- Add `structlog` for JSON-structured logs on Railway
- Log slow queries (>500ms) as warnings with `request_id`
- Log Socket.IO connection/disconnection events with team_id

---

## 🟡 PHASE 2: OPTIMIZATION

### 2.1 N+1 query eradication

| Location | Query | Fix |
|---|---|---|
| `routes/admin.py:104` | `Team.query.all()` without member counts | Add `selectinload(Team.members)` |
| `routes/tasks.py:201` | Cycle detection: per-dependency queries | Replace with recursive CTE |
| `routes/stats.py:44` | `visible_task_query().all()` → `to_dict()` | **Missing `_eager_task_options()`** — biggest N+1 risk |
| `routes/admin.py:187-213` | `filter_by(team_id=...)` repeated 5x | Single query with eager loads |

### 2.2 Frontend component splitting

| File | Lines | Split into |
|---|---|---|
| `ProjectsPage.tsx` | 1,028 | `ProjectList`, `ProjectDetail`, `ProjectForm`, `TemplateSelector` |
| `CalendarPage.tsx` | 824 | `CalendarGrid`, `CalendarDay`, `TaskPopover` |
| `TaskDetail.tsx` | 743 | `TaskHeader`, `TaskComments`, `TaskSubtasks`, `TaskDependencies` |
| `DashboardPage.tsx` | 489 | `StatCards`, `PriorityChart`, `ProjectChart`, `BlockedPanel`, `WeeklyReport` |

Run `npx vite-bundle-analyzer` to identify actual bundle size culprits.

### 2.3 Partial state updates (instead of full reloads)

**Current:** Many pages call `fetchTasks()` (full GET /tasks) on every Socket.IO event.

**Fix:** The Kanban page already does this well — extend the pattern:

```typescript
const handleTaskUpdate = (event: TaskEvent) => {
  if (event.task) {
    // Optimistic: update in-place instead of full reload
    setTasks(prev => prev.map(t => t.id === event.task_id ? event.task : t));
  }
  if (event.action === 'deleted') {
    setTasks(prev => prev.filter(t => t.id !== event.task_id));
  }
  // Only fall back to fetchTasks() for bulk operations
};
```

### 2.4 Add lightweight data fetching library

**Recommendation:** `@tanstack/react-query` (or `swr` for something smaller)

Benefits:
- Stale-while-revalidate (cache task lists for 30s)
- Deduplication (no redundant parallel fetches)
- Automatic background refetch on window focus
- Built-in loading/error states
- Optimistic mutations with rollback

### 2.5 Database query optimization

- Add composite indexes for remaining hot paths (check with `EXPLAIN ANALYZE` on Railway Postgres)
- Convert cycle-detection BFS to recursive SQL CTE
- Add pagination to admin list endpoints (`/admin/audit`, `/admin/teams`)
- Use `count()` subquery instead of `len(query.all())` in pagination

---

## 🟢 PHASE 3: INTUITIVE & SMOOTH UX

### 3.1 Consistent loading skeletons

| Page | Missing |
|---|---|
| `DashboardPage.tsx` | No skeleton — flashes empty then loads |
| `ProjectsPage.tsx` | No skeleton on initial load |
| `TaskDetail.tsx` panel | No skeleton while task data loads |
| Activity feed | No skeleton |

**Fix:** Create `<PageSkeleton />` variants for each page type and use them with `Suspense` boundaries.

### 3.2 Optimistic updates + double-submit guard

**Problem:** Form submit → loading toast → wait for API → update list. Feels laggy.

**Fix pattern for all CRUD forms:**

```typescript
const [submitting, setSubmitting] = useState(false);

const handleSubmit = async (data) => {
  setSubmitting(true);  // ← disables button immediately
  try {
    // Optimistic: add to local state with temp ID
    addOptimisticTask({ ...data, id: -Date.now() });
    const real = await api.tasks.create(data);
    replaceOptimisticTask(real);
  } catch {
    rollbackOptimisticTask();
    showToast("Błąd", "error");
  } finally {
    setSubmitting(false);
  }
};
```

**Also:** Add `disabled={submitting}` to all submit buttons (missing on TaskForm, InviteForm, TeamsAdminPage).

### 3.3 Inline form validation

**Problem:** All errors come as toasts — user doesn't know which field failed.

**Fix:** Route `ApiError` field-level errors to individual form fields:

```typescript
// api/client.ts already has ERROR_FIELD_LABELS
// Just surface them in forms:
{errors.title && <p className="text-xs text-destructive mt-1">{errors.title}</p>}
```

Pages to update: `TaskForm`, `AuthPage`, `InviteForm`, `TeamsAdminPage`.

### 3.4 Persist filter/sort state in URL

```typescript
// /tasks?priority=high&status=todo&project=Marketing
// On mount: read filters from URLSearchParams
// On filter change: update URL without page reload
// Enables: bookmarks, back/forward, sharing filtered views
```

### 3.5 Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `n` | New task (any page) |
| `/` | Focus search input |
| `g` `d` | Go to Dashboard |
| `g` `k` | Go to Kanban |
| `g` `t` | Go to Tasks |
| `g` `c` | Go to Calendar |
| `?` | Show shortcuts cheat sheet |

### 3.6 Mobile UX refinements

| Issue | Fix |
|---|---|
| Task detail panel on mobile | Replace side panel with full-screen modal |
| Calendar task density | Show count badge → tap to expand task list |
| Kanban scroll on mobile | Add scroll indicator dots |
| Table views (members, teams) | Responsive: collapse columns on small screens |
| Project cards | Add swipe-to-archive gesture |

### 3.7 Onboarding wizard

First-login flow for new managers/users:

1. **Welcome** — role explanation + team context
2. **Create your first project** — guided creation with template picker
3. **Invite your team** — generate an invite token + share link
4. **Create your first task** — quick-add via Command Palette
5. **Done** — show a getting-started checklist

---

## 🗺️ Implementation Roadmap (Sprint Plan)

| Sprint | Focus | Effort | Key Output |
|---|---|---|---|
| **Sprint 1** 🔥 **COMPLETED** | 🔴 1.1 Refactoring | 3 days | ✅ `routes/tasks.py` split: projects → `routes/projects.py`, emit helpers → `utils/realtime.py` |
| **Sprint 2** 🔥 **COMPLETED** | 🔴 1.2–1.5 Security | 3 days | ✅ Rate limiting, ✅ session hardening, ✅ N+1 fix, ✅ ErrorBoundary component |
| **Sprint 3** 🔥 **COMPLETED** | 🟡 2.1 Query optimization | 1 day | ✅ Batch team resource counts (14*N → 14 total), ✅ export_csv eager loading, ✅ admin audit pagination |
| **Sprint 4** | 🟡 2.3–2.4 Data fetching | 3 days | Partial state updates + React Query integration |
| **Sprint 5** | 🟢 3.1–3.3 UX polish | 3 days | Skeletons, optimistic updates, inline validation |
| **Sprint 6** | 🟢 3.4–3.7 Polish | 3 days | URL filters, keyboard shortcuts, mobile, onboarding |

**Total: ~18 days of focused work**

---

## 📊 Success Metrics

| Metric | Before | Target After |
|---|---|---|
| Backend test count | 220 | 260+ |
| Frontend test count | 18 | 40+ |
| `GET /tasks` p95 latency | ~26ms | <20ms |
| Lighthouse Performance score | ? | 90+ |
| JS bundle size (gzip) | ? | <150KB |
| Pages with loading skeletons | 2/8 | 8/8 |
| Forms with double-submit guard | 0/6 | 6/6 |
| Pages with inline validation | 0 | 4+ |

---

## ⚠️ Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `routes/tasks.py` refactor breaks imports | Deep test coverage before + CI pipeline after |
| React Query migration touches every component | Incremental: wrap one page at a time |
| Performance gains not visible on small datasets | Benchmark with `scripts/seed_perf.py` → `scripts/perf_bench.py` |
| Keyboard shortcuts conflict with browser defaults | Only use `g`+key prefix pattern |
| Onboarding wizard gets stale | Pull content from API, not hardcoded |
