---
description: Frontend TypeScript/React best practices for TaskMaster2
applyTo: "frontend/src/**/*.tsx,frontend/src/**/*.ts"
---

# Frontend TypeScript/React Guidelines

## Architecture & State Management

### Use Context API + Custom Hooks (Not Redux)

TaskMaster2 uses React Context API for state management. Each context provides a custom hook for clean component usage.

**Available Contexts:**
- `AuthContext` → `useAuth()` — Current user, login/logout, session
- `SocketContext` → `useSocket()` — Socket.IO connection state and `loadTasks()`
- `ThemeContext` → `useTheme()` — Dark mode toggle
- `ToastContext` → `useToast()` — Toast notifications with `showToast(message, type)`

**Example Usage in Component:**

```typescript
import { useAuth } from '../store/AuthContext';
import { useToast } from '../store/ToastContext';

export function TaskCard({ taskId }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  
  const handleDelete = async () => {
    try {
      await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      showToast('Task deleted', 'success');
      // Task list reloads via Socket.IO
    } catch (error) {
      showToast('Failed to delete task', 'error');
    }
  };
  
  return (
    <button onClick={handleDelete} disabled={!user.isAdmin && user.id !== taskId}>
      Delete
    </button>
  );
}
```

## Component Organization

### File Structure

```
frontend/src/
├── components/
│   ├── Layout/
│   │   └── DashboardLayout.tsx       # Main layout with dark mode toggle
│   ├── Tasks/
│   │   ├── TasksPage.tsx             # Container component
│   │   ├── TaskCard.tsx              # Presentational: single task display
│   │   ├── TaskDetail.tsx            # Modal/drawer: detailed view
│   │   └── TaskForm.tsx              # Form: create/edit task
│   ├── Dashboard/
│   │   └── DashboardPage.tsx         # Analytics/overview
│   ├── Auth/
│   │   └── AuthPage.tsx              # Login/signup
│   └── common/
│       ├── Skeletons.tsx             # Loading placeholders
│       └── Toaster.tsx               # Toast container
├── store/
│   ├── AuthContext.tsx               # Auth state + login/logout/validate
│   ├── SocketContext.tsx             # Socket.IO connection + real-time sync
│   ├── ThemeContext.tsx              # Dark mode state
│   └── ToastContext.tsx              # Toast notifications
├── api/
│   └── client.ts                     # Typed fetch wrapper
├── types/
│   └── index.ts                      # Shared TypeScript interfaces
└── App.tsx                           # Router + context providers
```

### Container vs. Presentational Components

- **Container components**: Handle data fetching, state management, side effects
  - Example: `TasksPage.tsx` — loads tasks, handles filters, passes data to children
- **Presentational components**: Receive props, render UI, emit events
  - Example: `TaskCard.tsx` — displays single task, calls `onEdit()` callback

**Pattern:**

```typescript
// Container
export function TasksPage() {
  const { tasks, loadTasks } = useSocket();
  
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);
  
  return (
    <div>
      {tasks.map(task => (
        <TaskCard key={task.id} task={task} onUpdate={() => loadTasks()} />
      ))}
    </div>
  );
}

// Presentational
interface TaskCardProps {
  task: Task;
  onUpdate: () => void;
}

export function TaskCard({ task, onUpdate }: TaskCardProps) {
  const { showToast } = useToast();
  
  const handleStatusChange = async (newStatus: string) => {
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    onUpdate();
  };
  
  return (
    <div className="card p-4">
      <h3>{task.title}</h3>
      <select value={task.status} onChange={(e) => handleStatusChange(e.target.value)}>
        <option>todo</option>
        <option>in_progress</option>
        <option>done</option>
      </select>
    </div>
  );
}
```

## TypeScript Best Practices

### Always Use Types/Interfaces

Define types in `frontend/src/types/index.ts` and import throughout:

```typescript
// types/index.ts
export interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'user';
  isAdmin: boolean;
}

export interface Task {
  id: number;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  due_date?: string;
  assignees: User[];
  comments: Comment[];
}

export interface Comment {
  id: number;
  text: string;
  author: User;
  created_at: string;
}
```

### Component Props Always Typed

```typescript
interface DashboardProps {
  title: string;
  tasks: Task[];
  onTaskSelect: (taskId: number) => void;
  isLoading?: boolean;  // Optional prop
}

export function Dashboard({ title, tasks, onTaskSelect, isLoading = false }: DashboardProps) {
  return <div>{/* ... */}</div>;
}
```

### Avoid `any` Type

❌ **Bad:**
```typescript
function handleData(data: any) {
  return data.task.title;  // No type safety
}
```

✅ **Good:**
```typescript
function handleData(data: Task) {
  return data.title;  // Type-safe
}
```

## API Calls & Error Handling

### Use Centralized `api/client.ts`

```typescript
// api/client.ts
export async function getTasks(): Promise<Task[]> {
  const response = await fetch('/api/tasks');
  if (!response.ok) throw new Error('Failed to fetch tasks');
  return response.json();
}

export async function createTask(data: Partial<Task>): Promise<Task> {
  const response = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) throw new Error('Failed to create task');
  return response.json();
}
```

### Handle Errors in Components

```typescript
export function TaskForm() {
  const { showToast } = useToast();
  const { loadTasks } = useSocket();
  
  const handleSubmit = async (formData: Partial<Task>) => {
    try {
      await createTask(formData);
      showToast('Task created successfully', 'success');
      loadTasks();  // Refresh list
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to create task', 'error');
    }
  };
  
  return <form onSubmit={(e) => { e.preventDefault(); handleSubmit(/*...*/) }} />;
}
```

## Styling with Tailwind CSS

### Class Naming Conventions

- Use Tailwind utilities directly
- For dark mode, use `dark:` prefix
- Group related utilities logically

```typescript
<div className="p-4 bg-background text-foreground dark:bg-slate-900 dark:text-slate-100 rounded-lg shadow-sm">
  <h2 className="text-lg font-semibold mb-2">Tasks</h2>
  <button className="btn btn-primary">Create Task</button>
</div>
```

### Dark Mode Support

The project uses `darkMode: 'class'` in [tailwind.config.ts](../../../frontend/tailwind.config.ts). Toggle is in [DashboardLayout.tsx](../../../frontend/src/components/Layout/DashboardLayout.tsx):

```typescript
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  
  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark' : ''}`}>
      <button onClick={toggleTheme}>Toggle Dark Mode</button>
      {children}
    </div>
  );
}
```

### Custom Theme Colors

See [frontend/src/index.css](../../../frontend/src/index.css) for turquoise-purple dark mode palette:

```css
.dark {
  --primary: 180 100% 50%;           /* Turquoise */
  --secondary: 270 100% 70%;         /* Purple */
  --accent: 180 90% 55%;             /* Light turquoise */
}
```

## Lazy Loading & Code Splitting

### Lazy-Load Route Components

In [App.tsx](../../../frontend/src/App.tsx):

```typescript
const TasksPage = lazy(() => import('./components/Tasks/TasksPage'));
const DashboardPage = lazy(() => import('./components/Dashboard/DashboardPage'));
const AdminPage = lazy(() => import('./components/Admin/AdminPage'));

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Skeletons count={5} />}>
        <Routes>
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
```

## Performance Tips

1. **Memoize Components**: Use `React.memo()` for presentational components that receive same props frequently
   ```typescript
   export const TaskCard = React.memo(({ task, onUpdate }: TaskCardProps) => {
     return <div>{task.title}</div>;
   });
   ```

2. **Avoid Inline Objects/Functions**: Define outside render
   ```typescript
   // ❌ Bad: new object created on every render
   <div style={{ marginTop: '10px' }} />
   
   // ✅ Good: defined once
   const styles = { marginTop: '10px' };
   <div style={styles} />
   ```

3. **Use `useCallback` for Event Handlers**: Prevent unnecessary re-renders
   ```typescript
   const handleClick = useCallback(() => {
     loadTasks();
   }, [loadTasks]);
   ```

## Testing

### Component Tests with Vitest/React Testing Library

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskCard } from './TaskCard';

describe('TaskCard', () => {
  it('renders task title', () => {
    const task = { id: 1, title: 'Test Task', status: 'todo' };
    render(<TaskCard task={task} onUpdate={() => {}} />);
    expect(screen.getByText('Test Task')).toBeInTheDocument();
  });
  
  it('calls onUpdate when status changes', async () => {
    const task = { id: 1, title: 'Test', status: 'todo' };
    const onUpdate = jest.fn();
    render(<TaskCard task={task} onUpdate={onUpdate} />);
    
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'in_progress' } });
    
    expect(onUpdate).toHaveBeenCalled();
  });
});
```

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Using `any` instead of types | Always define `Task`, `User`, `Comment` types |
| Forgetting `async/await` on API calls | Use `try/catch` with proper error handling |
| Not showing loading state | Display skeletons/spinners while fetching |
| Hardcoding magic strings | Use enums or constants: `TaskStatus.TODO` |
| Ignoring Socket.IO events | Ensure components respond to `loadTasks()` after mutations |
| Not memoizing expensive components | Use `React.memo()` for large lists |
| Inline styles instead of Tailwind | Use Tailwind classes; define theme in CSS |
