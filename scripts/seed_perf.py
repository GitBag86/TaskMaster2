#!/usr/bin/env python3
"""
Performance seed script for team-workspaces feature.
Creates 5 teams × 1000 tasks × 5 comments + 100 projects + 50 users per team.
"""

import os
import sys
from pathlib import Path
from datetime import datetime, timezone

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

os.environ.setdefault("FLASK_ENV", "development")
os.environ.setdefault("ENABLE_SCHEDULER", "false")

from app import create_app
from config import Config
from models import db, Team, User, Task, Comment, Project, Tag, SavedFilter, TaskTemplate, Notification, ActivityLog, CustomField, TaskDependency, Subtask, RecurringTask
from utils.template_service import seed_team_templates


def create_team_with_users(team_name, num_users=50, num_projects=100, num_tasks=1000, comments_per_task=5):
    """Create a team with users, projects, tasks, and nested resources."""
    team = Team(name=team_name, slug=team_name.lower().replace(" ", "-"), description=f"Team {team_name}")
    db.session.add(team)
    db.session.flush()

    # Create users
    users = []
    for i in range(num_users):
        user = User(
            username=f"{team_name.lower()}_user_{i}",
            email=f"{team_name.lower()}_user_{i}@example.com",
            role="user" if i > 0 else "manager",
            team_id=team.id
        )
        user.set_password("password")
        db.session.add(user)
        users.append(user)
    db.session.flush()

    # Create projects
    projects = []
    for i in range(num_projects):
        project = Project(
            name=f"{team_name} Project {i}",
            description=f"Description for {team_name} Project {i}",
            color=f"#{(i % 16777215):06x}",
            created_by_id=users[0].id,
            team_id=team.id
        )
        db.session.add(project)
        projects.append(project)
    db.session.flush()

    # Create tasks
    tasks = []
    for i in range(num_tasks):
        task = Task(
            user_id=users[i % len(users)].id,
            project_id=projects[i % len(projects)].id,
            team_id=team.id,
            title=f"{team_name} Task {i}",
            priority=["low", "medium", "high"][i % 3],
            status=["todo", "in_progress", "done"][i % 3],
            due_date=datetime.now(timezone.utc).date() if i % 10 == 0 else None
        )
        # Add assignees
        for j in range(2):
            task.assignees.append(users[(i + j) % len(users)])
        db.session.add(task)
        tasks.append(task)
    db.session.flush()

    # Create comments per task
    for task in tasks[:num_tasks]:  # Limit to avoid too many comments
        for j in range(comments_per_task):
            comment = Comment(
                task_id=task.id,
                team_id=team.id,
                author=users[j % len(users)].username,
                text=f"Comment {j} on {task.title}"
            )
            db.session.add(comment)

    # Create tags
    for i in range(20):
        tag = Tag(
            user_id=users[0].id,
            team_id=team.id,
            name=f"{team_name} Tag {i}",
            color=f"#{(i * 12345):06x}"
        )
        db.session.add(tag)
    db.session.flush()

    # Create saved filters
    for i in range(5):
        saved_filter = SavedFilter(
            user_id=users[0].id,
            team_id=team.id,
            name=f"{team_name} Filter {i}",
            filters={"status": ["todo", "in_progress"]}
        )
        db.session.add(saved_filter)

    # Create task templates
    for i in range(3):
        template = TaskTemplate(
            user_id=users[0].id,
            team_id=team.id,
            name=f"{team_name} Template {i}",
            description=f"Template {i} for {team_name}",
            template_data={"title": "Template task", "priority": "medium"}
        )
        db.session.add(template)

    # Create notifications
    for i in range(50):
        notification = Notification(
            user_id=users[i % len(users)].id,
            team_id=team.id,
            actor=users[0].username,
            type="info",
            message=f"Notification {i} for {team_name}"
        )
        db.session.add(notification)

    # Create activity logs
    for i in range(100):
        activity = ActivityLog(
            user_id=users[i % len(users)].id,
            team_id=team.id,
            action="task.update",
            details={"field": "status", "from": "todo", "to": "in_progress"}
        )
        db.session.add(activity)

    # Create custom fields
    for i in range(10):
        custom_field = CustomField(
            user_id=users[0].id,
            task_id=tasks[i].id,
            team_id=team.id,
            field_name=f"Custom Field {i}",
            field_value=f"Value {i}"
        )
        db.session.add(custom_field)

    # Create task dependencies (every 10th task depends on previous)
    for i in range(10, num_tasks, 10):
        dep = TaskDependency(
            task_id=tasks[i].id,
            depends_on_task_id=tasks[i - 10].id,
            team_id=team.id
        )
        db.session.add(dep)

    # Create subtasks
    for i, task in enumerate(tasks[:100]):  # Limit subtasks
        for j in range(3):
            subtask = Subtask(
                task_id=task.id,
                team_id=team.id,
                title=f"Subtask {j} for {task.title}",
                completed=(j == 2)
            )
            db.session.add(subtask)

    # Create recurring tasks
    for i in range(5):
        recurring = RecurringTask(
            task_id=tasks[i].id,
            team_id=team.id,
            frequency="weekly",
            interval=1,
            end_date=datetime.now(timezone.utc).date().replace(month=12, day=31)
        )
        db.session.add(recurring)

    db.session.commit()
    return team


def main():
    print("Starting performance seed...")
    
    app = create_app(Config)
    
    with app.app_context():
        # Clear existing data but keep schema (indexes from migrations)
        # Order matters: children before parents
        from sqlalchemy import text
        for tname in [
            'task_assignees', 'project_members', 'task_tags',
            'comment', 'subtask', 'task_dependency', 'custom_field',
            'recurring_task', 'notification', 'activity_log',
            'saved_filter', 'task_template', 'project_template',
            'task', 'project', 'tag',
            'team_invite', 'team_audit_log',
        ]:
            try:
                db.session.execute(text(f"DELETE FROM {tname}"))
            except Exception as e:
                print(f"  skip {tname}: {e}")
        # Delete users that aren't bootstrap super_admin to avoid CHECK constraint
        db.session.execute(text("DELETE FROM \"user\" WHERE role != 'super_admin'"))
        db.session.execute(text("DELETE FROM team"))
        db.session.commit()
        print("Database cleared (schema preserved).")
        
        # Create 5 teams
        teams = []
        for i in range(5):
            team_name = f"Team {i+1}"
            print(f"Creating {team_name}...")
            team = create_team_with_users(team_name)
            teams.append(team)
            print(f"  OK {team_name}: {team.id}")
        
        # Seed templates for each team
        for team in teams:
            print(f"Seeding templates for {team.name}...")
            seed_team_templates(team.id, created_by_id=team.members[0].id)
        
        # Print summary
        print("\n=== Seed Summary ===")
        print(f"Teams: {Team.query.count()}")
        print(f"Users: {User.query.count()}")
        print(f"Projects: {Project.query.count()}")
        print(f"Tasks: {Task.query.count()}")
        print(f"Comments: {Comment.query.count()}")
        print(f"Tags: {Tag.query.count()}")
        print(f"Saved Filters: {SavedFilter.query.count()}")
        print(f"Task Templates: {TaskTemplate.query.count()}")
        print(f"Notifications: {Notification.query.count()}")
        print(f"Activity Logs: {ActivityLog.query.count()}")
        print(f"Custom Fields: {CustomField.query.count()}")
        print(f"Task Dependencies: {TaskDependency.query.count()}")
        print(f"Subtasks: {Subtask.query.count()}")
        print(f"Recurring Tasks: {RecurringTask.query.count()}")
        print("\nSeed complete!")


if __name__ == "__main__":
    main()
