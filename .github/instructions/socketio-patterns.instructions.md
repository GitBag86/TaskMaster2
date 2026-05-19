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

### Backend Test Example

```python
def test_create_task_emits_socket_event(client, mocker):
    # Mock socketio.emit
    mock_emit = mocker.patch('socketio.emit')
    
    # Create task
    response = client.post('/api/tasks', json={'title': 'Test'})
    assert response.status_code == 201
    
    # Verify emit was called
    mock_emit.assert_called_once_with(
        'task_action',
        {
            'action': 'create',
            'task_id': 1,
            'task': {'id': 1, 'title': 'Test', ...}
        },
        broadcast=True
    )
```

## Debugging Socket.IO Issues

### Check Browser Console

1. Open DevTools (F12)
2. Look for Socket.IO connection logs:
   ```
   ✓ Socket connected (check Network tab for handshake)
   ✓ task_action event received (check Console for logged events)
   ```

### Check Server Logs

```bash
# In terminal running Flask dev server
[2026-05-19 10:30:45] Socket.IO server initialized
[2026-05-19 10:31:00] task_action emitted: {'action': 'create', 'task_id': 1}
```

### Common Issues

**Issue**: Socket events not reaching frontend
- Check: Is `broadcast=True` used in backend?
- Check: Is Socket connected? (check Network tab)
- Fix: Restart both backend and frontend

**Issue**: Old data showing in UI
- Check: Is `db.session.commit()` called before emit?
- Check: Is task list reloading (`loadTasks()` called)?
- Fix: Verify payload includes updated task object

**Issue**: Multiple duplicate events
- Check: Is event listener duplicated (multiple `socket.on()` calls)?
- Fix: Ensure `useEffect` cleanup removes listener with `socket?.off()`
