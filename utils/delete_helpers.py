from models import (
    ActivityLog,
    CustomField,
    Notification,
    RecurringTask,
)


def prepare_task_for_delete(task):
    """Clear rows that Postgres will otherwise protect with foreign keys."""
    task.assignees.clear()
    task.tags.clear()
    ActivityLog.query.filter_by(task_id=task.id).update({"task_id": None})
    Notification.query.filter_by(task_id=task.id).update({"task_id": None})
    CustomField.query.filter_by(task_id=task.id).delete()
    RecurringTask.query.filter_by(task_id=task.id).delete()
