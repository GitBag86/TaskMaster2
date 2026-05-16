---
description: Guides the implementation of real-time features using Flask-SocketIO (Backend) and Socket.io client (Frontend).
---

# SocketIO Patterns

Follow these conventions when adding real-time updates to the Task Management application.

## 1. Backend Implementation (`app.py`)
- **Initialization:** Use `socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')` (local) or `gthread` (Docker). Avoid `eventlet` due to deprecation.
- **Event Naming:** Use `category_action` (e.g., `task_created`, `comment_added`).
- **Broadcasting:** Always broadcast updates to relevant users. 
  - For global updates: `socketio.emit('event_name', data)`. (Do NOT use `broadcast=True` with the `socketio` object).
  - For specific users (future-proofing): Consider using Socket.io rooms named after `user_id`.

## 2. Frontend Implementation (`index.html` / `script`)
- **Connection:** `const socket = io();`
- **Error Handling:** Listen for `connect_error` to alert the user via `showToast`.
- **Event Handlers:**
  - Map incoming events to existing UI refresh functions (e.g., `socket.on('task_updated', () => loadTasks())`).
  - Use `showToast` to notify the user that a real-time update just occurred (e.g., "A new comment was added!").

## 3. Production Environment
- **Gunicorn:** Remind the agent that Gunicorn must run with `--worker-class eventlet` for WebSockets to function correctly.
- **Transports:** Stick to standard WebSocket transports unless the environment (proxy/load balancer) forces polling.
