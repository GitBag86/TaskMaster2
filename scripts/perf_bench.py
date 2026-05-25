#!/usr/bin/env python3
"""
Performance benchmark for team-workspaces endpoints.

Measures p50/p95/p99 latency for the 4 hot-path endpoints listed in Task 21:
- GET /tasks?page=1&per_page=50
- GET /tasks/today
- GET /stats/dashboard
- GET /tasks/blocked

Target: <100ms p95 on the 5-team x 1000 tasks seed.

Also runs EXPLAIN QUERY PLAN to verify the right indexes are used.
"""

import os
import sys
import time
import statistics
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

os.environ.setdefault("FLASK_ENV", "development")
os.environ.setdefault("ENABLE_SCHEDULER", "false")

from app import create_app
from config import Config
from models import db, User, Team


def login(client, user):
    with client.session_transaction() as sess:
        sess["user_id"] = user.id
        sess["team_id"] = user.team_id
        sess["role"] = user.role
        sess["session_version"] = user.session_version


def time_request(client, path, runs=20):
    """Run an endpoint multiple times and return latency statistics."""
    timings = []
    # Warmup
    for _ in range(3):
        client.get(path)
    for _ in range(runs):
        start = time.perf_counter()
        resp = client.get(path)
        elapsed = (time.perf_counter() - start) * 1000  # ms
        timings.append(elapsed)
    timings.sort()
    return {
        "status": resp.status_code,
        "runs": runs,
        "p50": timings[len(timings) // 2],
        "p95": timings[int(len(timings) * 0.95)],
        "p99": timings[int(len(timings) * 0.99)],
        "min": min(timings),
        "max": max(timings),
        "mean": statistics.mean(timings),
    }


def explain(query):
    """Run EXPLAIN QUERY PLAN on a raw SQL query (SQLite)."""
    from sqlalchemy import text
    rows = db.session.execute(text(f"EXPLAIN QUERY PLAN {query}")).fetchall()
    for r in rows:
        # SQLite EXPLAIN QUERY PLAN: (id, parent, notused, detail)
        print(f"    {r[3] if len(r) > 3 else r}")


def main():
    app = create_app(Config)

    with app.app_context():
        # Pick a manager from Team 1
        team = Team.query.filter_by(name="Team 1").first()
        if not team:
            print("No Team 1 found — run scripts/seed_perf.py first")
            return

        manager = User.query.filter_by(team_id=team.id, role="manager").first()
        if not manager:
            print("No manager in Team 1")
            return

        # Show key query plans
        print("=" * 70)
        print("QUERY PLANS (verify index usage)")
        print("=" * 70)

        print("\n[1] Tasks list paginated:")
        print("    SELECT FROM task WHERE team_id=1 ORDER BY due_date LIMIT 50")
        explain("SELECT * FROM task WHERE team_id = 1 ORDER BY due_date DESC LIMIT 50")

        print("\n[2] Today's tasks (open + due_date NOT NULL):")
        explain("SELECT * FROM task WHERE team_id = 1 AND completed = 0 AND due_date IS NOT NULL")

        print("\n[3] Status filter:")
        explain("SELECT * FROM task WHERE team_id = 1 AND status = 'todo'")

        print("\n[4] Notifications unread:")
        explain("SELECT * FROM notification WHERE team_id = 1 AND user_id = 1 AND read = 0")

        print("\n[5] Activity log per team:")
        explain("SELECT * FROM activity_log WHERE team_id = 1 ORDER BY created_at DESC LIMIT 50")

        # Run timed benchmarks
        print()
        print("=" * 70)
        print("ENDPOINT BENCHMARKS (target: p95 < 100ms)")
        print("=" * 70)

        client = app.test_client()
        login(client, manager)

        endpoints = [
            ("GET /tasks?page=1&per_page=50", "/tasks?page=1&per_page=50"),
            ("GET /tasks/today",              "/tasks/today"),
            ("GET /stats/dashboard",          "/stats/dashboard"),
            ("GET /tasks/blocked",            "/tasks/blocked"),
        ]
        # Note: /tasks/filter, /tasks/by-project, /tasks/dependency-board, /tasks/search
        # return all matching team tasks unpaginated. With 1000 tasks per team and full
        # to_dict() serialization (assignees + comments + subtasks + dependencies), these
        # endpoints take 150-250ms — driven by Python serialization, not DB. Not in scope
        # of Task 21 (which targets the four hot-path endpoints above) but candidates
        # for follow-up: pagination + a slimmer list serializer.

        results = []
        for label, path in endpoints:
            stats = time_request(client, path, runs=30)
            results.append((label, stats))

        # Pretty-print
        print(f"\n{'Endpoint':<35} {'Status':<8} {'p50':<10} {'p95':<10} {'p99':<10} {'mean':<10}")
        print("-" * 90)
        all_pass = True
        for label, s in results:
            mark = "OK" if s["p95"] < 100 else "FAIL"
            if s["p95"] >= 100:
                all_pass = False
            print(f"{label:<35} {s['status']:<8} {s['p50']:<10.2f} {s['p95']:<10.2f} {s['p99']:<10.2f} {s['mean']:<10.2f} [{mark}]")

        print()
        if all_pass:
            print("RESULT: All endpoints meet the <100ms p95 target.")
        else:
            print("RESULT: Some endpoints exceed the 100ms p95 target — see above.")
        print()


if __name__ == "__main__":
    main()
