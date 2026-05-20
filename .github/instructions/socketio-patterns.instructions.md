---
description: Socket.IO real-time synchronization patterns for TaskMaster2
applyTo: "routes/**/*.py,frontend/src/store/SocketContext.tsx,frontend/src/components/**/*.tsx"
---

# Socket.IO Real-Time Synchronization Patterns

## Overview

TaskMaster2 uses Socket.IO to keep all connected clients in sync when tasks are created, updated, or deleted. Every state-changing operation (POST/PATCH/DELETE) **MUST** emit a `task_action` event to notify other clients.

## Backend Emission Pattern (Flask + Socket.IO)

### Basic Pattern

```python
from flask_socketio import emit

@app.route('/api/tasks', methods=['POST'])
@login_required
def create_task():
    data = request.json
    task = Task(title=data['title'], owner_id=current_user.id)
    db.session.add(task)
    db.session.commit()
    
    # CRITICAL: Emit to all connected clients
    socketio.emit('task_action', {
        'action': 'create',
        'task_id': task.id,
        'task': task.to_dict()
    }, broadcast=True)
    
    return jsonify(task.to_dict()), 201
```

### Supported Actions

| Action | When to Use | Payload |
|--------|-----------|---------|
| `create` | New task added | `{'action': 'create', 'task_id': id, 'task': task_dict}` |
| `update` | Task modified (title, status, priority, etc.) | `{'action': 'update', 'task_id': id, 'task': task_dict}` |
| `delete` | Task removed | `{'action': 'delete', 'task_id': id}` |
| `comment` | Comment added to task | `{'action': 'comment', 'task_id': id, 'comment': comment_dict}` |
| `assign` | User assigned to task | `{'action': 'assign', 'task_id': id, 'user_id': user_id}` |

### Emission Checklist

- [ ] Emit immediately after `db.session.commit()`
- [ ] Include `broadcast=True` to reach all clients (not just sender)
- [ ] Include task ID and action type
- [ ] Include full task object (for UI refresh) when appropriate
- [ ] Handle errors gracefully; emit should not block endpoint

### Example: Update Task

```python
@app.route('/api/tasks/<int:task_id>', methods=['PATCH'])
@login_required
def update_task(task_id):
    task = Task.query.get_or_404(task_id)
    # Authorization check (owner or admin)
    
    data = request.json
    task.title = data.get('title', task.title)
    task.status = data.get('status', task.status)
    task.priority = data.get('priority', task.priority)
    db.session.commit()
    
    # Emit update to all clients
    socketio.emit('task_action', {
        'action': 'update',
        'task_id': task.id,
        'task': task.to_dict()
    }, broadcast=True)
    
    return jsonify(task.to_dict()), 200
```

### Example: Delete Task

```python
@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
@login_required
def delete_task(task_id):
    task = Task.query.get_or_404(task_id)
    # Authorization check
    
    db.session.delete(task)
    db.session.commit()
    
    # Emit delete to all clients
    socketio.emit('task_action', {
        'action': 'delete',
        'task_id': task.id
    }, broadcast=True)
    
    return '', 204
```

## Frontend Listener Pattern (React + TypeScript)

### Socket Context Setup

Frontend listens for `task_action` events in [frontend/src/store/SocketContext.tsx](../../../frontend/src/store/SocketContext.tsx):

```typescript
useEffect(() => {
  const handleTaskAction = (data: TaskAction) => {
    console.log('Task action received:', data);
    
    switch (data.action) {
      case 'create':
      case 'update':
      case 'delete':
      case 'comment':
        // Trigger full task list reload
        loadTasks();
        showToast(`Task ${data.action}d`, 'info');
        break;
    }
  };
  
  socket?.on('task_action', handleTaskAction);
  
  return () => {
    socket?.off('task_action', handleTaskAction);
  };
}, [socket, loadTasks, showToast]);
```

### Component Usage

Components that modify tasks should:
1. Make API call (POST/PATCH/DELETE)
2. Listen for Socket.IO event (automatic via SocketContext)
3. Show toast notification on success

```typescript
// In a React component
const handleCreateTask = async (formData) => {
  try {
    const response = await fetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(formData)
    });
    const task = await response.json();
    showToast('Task created!', 'success');
    // Task list reloads via Socket.IO event
  } catch (error) {
    showToast('Failed to create task', 'error');
  }
};
```

## Broadcast Behavior

### Current Implementation

- **`broadcast=True`**: Emits to ALL connected clients, including the sender.
- **Future Optimization**: Consider `broadcast=False` (emit only to other clients) if sender handles UI updates immediately.

## Common Pitfalls

| Pitfall | Impact | Fix |
|---------|--------|-----|
| Missing `emit_task_event()` | Other clients don't see changes | Add emission after every DB mutation |
| `broadcast=False` by default | Changes invisible to other clients | Always use `broadcast=True` |
| Emitting before `db.session.commit()` | Stale data sent to clients | Emit after commit |
| Including sensitive data in emit | Credentials exposed to all clients | Filter payload; use `to_dict()` method |
| No error handling on emit | Silent failures in real-time sync | Wrap in try/catch; log errors |
| Frontend ignoring socket events | UI doesn't reflect server state | Ensure `SocketContext` is initialized |

## Testing Socket.IO Emissions

### Backend Test Example (TDD Required)

Write tests **BEFORE** implementing the endpoint:

```python
import pytest
from unittest.mock import patch, call

@pytest.fixture
def app_client(app):
    return app.test_client()

def test_create_task_emits_socket_event(app_client, mocker):
    """Test that creating a task emits task_action event."""
    # Mock socketio.emit
    mock_emit = mocker.patch('app.socketio.emit')
    
    # Mock authentication
    with app_client.session_transaction() as sess:
        sess['user_id'] = 1
    
    # Create task
    response = app_client.post('/api/tasks', json={'title': 'Test Task'})
    assert response.status_code == 201
    
    # Verify emit was called with correct payload
    mock_emit.assert_called_once()
    call_args = mock_emit.call_args
    assert call_args[0][0] == 'task_action'  # event name
    assert call_args[0][1]['action'] == 'create'
    assert call_args[1]['broadcast'] is True

def test_update_task_emits_socket_event(app_client, mocker):
    """Test that updating a task emits task_action event."""
    mock_emit = mocker.patch('app.socketio.emit')
    
    with app_client.session_transaction() as sess:
        sess['user_id'] = 1
    
    # Update task
    response = app_client.patch('/api/tasks/1', json={'status': 'completed'})
    assert response.status_code == 200
    
    # Verify emit
    mock_emit.assert_called_once()
    assert mock_emit.call_args[0][1]['action'] == 'update'

def test_delete_task_emits_socket_event(app_client, mocker):
    """Test that deleting a task emits task_action event."""
    mock_emit = mocker.patch('app.socketio.emit')
    
    with app_client.session_transaction() as sess:
        sess['user_id'] = 1
    
    # Delete task
    response = app_client.delete('/api/tasks/1')
    assert response.status_code == 204
    
    # Verify emit
    mock_emit.assert_called_once()
    assert mock_emit.call_args[0][1]['action'] == 'delete'
```

### Run Tests

```bash
# Run Socket.IO emission tests only
pytest tests/ -k "socket" -v

# Run all tests with coverage
pytest --cov=routes tests/
```

## Debugging Socket.IO Issues

### 1. Verify Backend Emission (Flask)

**Is the endpoint emitting the event?**

```bash
# Add debug logging to your route handler
@app.route('/api/tasks', methods=['POST'])
@login_required
def create_task():
    data = request.json
    task = Task(title=data['title'], owner_id=current_user.id)
    db.session.add(task)
    db.session.commit()
    
    # Debug: Log before emitting
    print(f"[DEBUG] Emitting task_action: {{'action': 'create', 'task_id': {task.id}}}")
    socketio.emit('task_action', {
        'action': 'create',
        'task_id': task.id,
        'task': task.to_dict()
    }, broadcast=True)
    
    return jsonify(task.to_dict()), 201
```

Run server with verbose logging:
```bash
FLASK_ENV=development python app.py
# Look for [DEBUG] Emitting task_action in terminal
```

### 2. Check Browser Console (Frontend)

1. Open DevTools (F12 → Console tab)
2. Check for Socket.IO connection messages:
   ```
   ✓ Socket connected
   ✓ Socket.IO: Successfully connected to http://localhost:5000/
   ```
3. Check for event logs:
   ```
   [Socket.IO] task_action: {action: 'create', task_id: 1, task: {...}}
   ```

4. Check Network tab (F12 → Network):
   - Filter by WebSocket
   - Look for `/socket.io/?` requests
   - Status should be `101 Switching Protocols`

### 3. Common Issues & Fixes

#### Issue: "WebSocket connection failed"
**Symptoms**: 
- Console shows "WebSocket connection to 'ws://localhost:5000/socket.io/' failed"
- Browser Network tab shows red X on socket.io requests

**Fixes**:
```bash
# 1. Verify Flask backend is running
lsof -i :5000  # On macOS/Linux
netstat -ano | findstr :5000  # On Windows

# 2. Verify Socket.IO is initialized in app.py
# Should see: socketio = SocketIO(app, cors_allowed_origins=[...])

# 3. Restart both frontend and backend
kill -9 $(lsof -t -i:5000)  # Kill Flask
cd frontend && npm run dev    # Restart frontend
python app.py                 # Restart Flask in new terminal
```

#### Issue: "Socket connected but events not received"
**Symptoms**:
- Browser shows socket connected (✓)
- But `loadTasks()` not triggered after creating a task
- Old data still showing

**Fixes**:
```python
# 1. Verify emit is called AFTER db.session.commit()
db.session.commit()  # MUST come before emit
socketio.emit('task_action', {...}, broadcast=True)  # THEN emit

# 2. Check broadcast=True is set
# Wrong: socketio.emit('task_action', {...})  # Defaults to broadcast=False
# Right: socketio.emit('task_action', {...}, broadcast=True)

# 3. Verify SocketContext listener is active
# In browser console:
console.log(socket);  // Should show Socket object, not null
```

#### Issue: "Events received but old data in UI"
**Symptoms**:
- Socket event fires (see in Network tab)
- But task list shows old data
- Need to refresh page to see changes

**Fixes**:
```typescript
// In SocketContext.tsx, ensure loadTasks() is called
const handleTaskAction = (data: TaskAction) => {
  console.log('Task action received:', data);
  // MUST trigger full reload
  loadTasks();  // Reload from /api/tasks
  showToast(`Task ${data.action}d`, 'info');
};
```

#### Issue: "Duplicate events or infinite loops"
**Symptoms**:
- `loadTasks()` called multiple times
- Network tab shows many GET /api/tasks requests
- Events firing 2-3 times per action

**Fixes**:
```typescript
// Ensure useEffect cleanup removes old listener
useEffect(() => {
  const handleTaskAction = (data: TaskAction) => {
    console.log('Task action received:', data);
    loadTasks();
  };
  
  socket?.on('task_action', handleTaskAction);
  
  // CRITICAL: Remove listener on cleanup
  return () => {
    socket?.off('task_action', handleTaskAction);  // Prevent duplicates
  };
}, [socket, loadTasks]);  // Re-subscribe if dependencies change
```

### 4. Enable Verbose Socket.IO Logging

**Backend** (Flask):
```python
import logging
logging.getLogger('socketio').setLevel(logging.DEBUG)
logging.getLogger('engineio').setLevel(logging.DEBUG)
```

**Frontend** (React):
```typescript
// In SocketContext.tsx, before creating socket
const socket = io(socketUrl, {
  reconnection: true,
  transports: ['websocket', 'polling'],
  debug: true  // Verbose logging
});
```

### 5. Test Checklist

- [ ] Backend endpoint calls `db.session.commit()` before emit
- [ ] Backend emits with `broadcast=True`
- [ ] Event name is exactly `task_action`
- [ ] Action name matches (create/update/delete/comment)
- [ ] Frontend Socket is connected (check console)
- [ ] SocketContext listener exists for `task_action`
- [ ] `loadTasks()` called in listener
- [ ] useEffect cleanup removes listener with `socket?.off()`
- [ ] Tests pass: `pytest -k socket -v`
