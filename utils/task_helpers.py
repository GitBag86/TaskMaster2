"""Shared query and helper functions for task-related route handlers.

Consolidated here to eliminate duplication between routes/tasks.py,
routes/stats.py, routes/projects.py, and routes/filters.py.

See design 4.4 (team scoping) and design 15 (performance).
"""

from __future__ import annotations

from flask import g

from models import Task, User
from utils.scoping import team_scoped


def assigned_task_query(user):
    """Base query for tasks assigned to a specific user, scoped to the current team."""
    return team_scoped(Task.query, Task).filter(Task.assignees.any(User.id == user.id))


def visible_task_query(user, include_archived=False):
    """Query returning tasks the current user is allowed to see.

    Manager / super_admin see all non-archived tasks in their team.
    Regular users see only tasks they are assigned to.

    Pass ``include_archived=True`` when archived tasks should be included
    (e.g. dashboard stats that count historical data).
    """
    if g.get("current_role") in ("manager", "super_admin"):
        q = team_scoped(Task.query, Task)
    else:
        q = assigned_task_query(user)
    if not include_archived:
        q = q.filter(Task.archived == False)
    return q


def assignee_names(task):
    """Comma-separated usernames of a task's assignees."""
    return ", ".join(user.username for user in task.assignees)


def task_is_done(task):
    """True when a task is considered completed (either flag or status)."""
    return task.completed or task.status == "done"


def user_can_access_task(user, task):
    """Check whether *user* can view *task* based on role or assignment.

    Manager / super_admin see everything in their team.
    Regular users see only tasks they are assigned to.
    """
    return g.get("current_role") in ("manager", "super_admin") or user in task.assignees


def task_open_dependencies(task):
    """List of uncompleted tasks that *task* depends on."""
    return [
        dependency.depends_on_task
        for dependency in task.dependencies
        if dependency.depends_on_task and not task_is_done(dependency.depends_on_task)
    ]


def task_open_subtasks(task):
    """List of uncompleted subtasks belonging to *task*."""
    return [subtask for subtask in task.subtasks if not subtask.completed]
