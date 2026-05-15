---
description: Scaffolds pytest suites for Flask API endpoints, ensuring coverage for models, routes, and role-based access control (RBAC).
---

# Backend Test Generator

When asked to "generate tests" or "add tests for [feature]", follow this structure to ensure robustness:

## 1. Test Setup (conftest.py)
Ensure a `tests/conftest.py` exists with these fixtures:
- `app`: Configured with `TESTING=True` and an in-memory SQLite database (`sqlite:///:memory:`).
- `client`: A Flask test client.
- `db_session`: Handles `db.create_all()` and `db.drop_all()` per test.
- `admin_user` / `regular_user`: Fixtures that create users with specific roles and return their session cookies or IDs.

## 2. Model Tests
For any new model:
- Test instantiation with valid data.
- Test validation constraints (e.g., uniqueness, length) via `db.session.commit()`.
- Test `to_dict()` serialization.

## 3. Route Tests
For every new endpoint:
- **Success Case:** Assert `200` or `210` status code and verify JSON payload structure.
- **Unauthorized Case:** Assert `401` when no user is logged in.
- **Forbidden Case:** Assert `403` when a user with an insufficient role (e.g., `user` trying to access `admin` route) makes a request.
- **Validation Case:** Assert `400` when the request payload fails Marshmallow validation.

## 4. Execution Command
Always remind the user or run:
```bash
pytest tests/
```
