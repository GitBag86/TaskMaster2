import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import TaskDependencies from './TaskDependencies'
import type { Task, TaskSummary, TaskDependency as TaskDependencyType } from '@/types'

const mockAddToast = vi.fn()
const mockAddDependency = vi.fn().mockResolvedValue({ id: 10, task_id: 1, depends_on_task_id: 3, created_at: null })
const mockRemoveDependency = vi.fn().mockResolvedValue({ message: 'ok' })
const mockGetAll = vi.fn().mockResolvedValue({
  tasks: [
    { id: 3, title: 'Other Task', status: 'todo', completed: false, project: 'Test', due_date: null },
    { id: 4, title: 'Another Task', status: 'in_progress', completed: false, project: 'Other', due_date: '2024-03-01' },
  ],
  total: 2, page: 1, pages: 1, per_page: 200,
})
vi.mock('@/store/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'admin', role: 'manager', email: 'admin@test.com', team_id: 1, terms_accepted: true, privacy_accepted: true, marketing_consent: false, consented_at: null, created_at: '' },
  }),
}))

vi.mock('@/store/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}))

vi.mock('@/api/client', () => ({
  api: {
    tasks: {
      getAll: (...args: unknown[]) => mockGetAll(...args),
      addDependency: (...args: unknown[]) => mockAddDependency(...args),
      removeDependency: (...args: unknown[]) => mockRemoveDependency(...args),
    },
  },
}))

const makeTask = (id: number): Task => ({
  id,
  title: 'Main Task',
  priority: 'medium',
  status: 'todo',
  completed: false,
  project: 'Test',
  project_id: 1,
  project_info: null,
  due_date: null,
  notes: '',
  assignees: [],
  comments: [],
  subtasks: [],
  dependencies: [],
  blocked_by: [],
  blocking: [],
  is_blocked: false,
  created_at: '2024-01-01T00:00:00Z',
})

const makeDependency = (id: number, taskId: number, dependsOnId: number, task: TaskSummary | null = null): TaskDependencyType => ({
  id,
  task_id: taskId,
  depends_on_task_id: dependsOnId,
  depends_on_task: task,
  created_at: null,
})

const blockingTasks: TaskSummary[] = [
  { id: 5, title: 'Blocked Task A', status: 'todo', completed: false, project: 'Test', due_date: null },
  { id: 6, title: 'Blocked Task B', status: 'in_progress', completed: false, project: 'Test', due_date: null },
]

const dependencies: TaskDependencyType[] = [
  makeDependency(1, 1, 3, { id: 3, title: 'Depends On Me', status: 'todo', completed: false, project: 'Test', due_date: null }),
]

describe('TaskDependencies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the section title', () => {
    render(
      <TaskDependencies
        task={makeTask(1)}
        dependencies={[]}
        blocking={[]}
        onDependencyChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Zależności')).toBeInTheDocument()
  })

  it('shows dependency count', () => {
    render(
      <TaskDependencies
        task={makeTask(1)}
        dependencies={dependencies}
        blocking={[]}
        onDependencyChange={vi.fn()}
      />,
    )
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('shows empty state when no dependencies', () => {
    render(
      <TaskDependencies
        task={makeTask(1)}
        dependencies={[]}
        blocking={[]}
        onDependencyChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Brak zależności.')).toBeInTheDocument()
  })

  it('renders dependency task title', () => {
    render(
      <TaskDependencies
        task={makeTask(1)}
        dependencies={dependencies}
        blocking={[]}
        onDependencyChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Depends On Me')).toBeInTheDocument()
  })

  it('shows blocked message when task is blocked', () => {
    const task = makeTask(1)
    task.is_blocked = true
    render(
      <TaskDependencies
        task={task}
        dependencies={dependencies}
        blocking={[]}
        onDependencyChange={vi.fn()}
      />,
    )
    expect(screen.getByText(/zakończyć dopiero po zamknięciu/)).toBeInTheDocument()
  })

  it('shows add dependency form for admin users', () => {
    render(
      <TaskDependencies
        task={makeTask(1)}
        dependencies={dependencies}
        blocking={[]}
        onDependencyChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Dodaj blokujące zadanie')).toBeInTheDocument()
    expect(screen.getByText('Dodaj')).toBeInTheDocument()
  })

  it('shows remove button for admin users', () => {
    render(
      <TaskDependencies
        task={makeTask(1)}
        dependencies={dependencies}
        blocking={[]}
        onDependencyChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Usuń')).toBeInTheDocument()
  })

  it('renders blocking section', () => {
    render(
      <TaskDependencies
        task={makeTask(1)}
        dependencies={[]}
        blocking={blockingTasks}
        onDependencyChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Blokuje')).toBeInTheDocument()
    expect(screen.getByText('Blocked Task A')).toBeInTheDocument()
    expect(screen.getByText('Blocked Task B')).toBeInTheDocument()
  })

  it('does not show remove when no dependencies', () => {
    render(
      <TaskDependencies
        task={makeTask(1)}
        dependencies={[]}
        blocking={[]}
        onDependencyChange={vi.fn()}
      />,
    )
    expect(screen.queryByText('Usuń')).not.toBeInTheDocument()
  })

  it('disables add button when no dependency selected', () => {
    render(
      <TaskDependencies
        task={makeTask(1)}
        dependencies={[]}
        blocking={[]}
        onDependencyChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Dodaj')).toBeDisabled()
  })
})
