---
description: Ensures database schema integrity and SQLAlchemy model synchronization after a 'flask db upgrade'.
---

# Post-Migration Check

Perform these checks immediately after running `flask db upgrade` or modifying the SQLAlchemy models.

## 1. Schema-to-Model Sync
- Run `flask db migrate -m "verification"` to see if Alembic detects any un-migrated changes.
- If it returns "No changes in schema detected", the models and database are in sync.
- If it detects changes, alert the agent/user that a model update was missed in the previous migration.

## 2. Integrity Verification
Verify that critical constraints are still intact:
- **Foreign Keys:** Ensure child objects (Comments/Subtasks) are still correctly linked to parent Tasks.
- **Cascades:** Verify that `all, delete-orphan` logic still functions (deleting a Task should remove its Subtasks).

## 3. Serialization Consistency
- Check that `to_dict()` methods in `app.py` and Marshmallow schemas in `schemas.py` have been updated to include any newly added columns.
- Failure to do this will result in the frontend not seeing the new data.

## 4. Test Data
Run a simple query script to verify the upgrade didn't corrupt existing data:
```python
# Quick check
with app.app_context():
    print(f"Total Users: {User.query.count()}")
    print(f"Total Tasks: {Task.query.count()}")
```
