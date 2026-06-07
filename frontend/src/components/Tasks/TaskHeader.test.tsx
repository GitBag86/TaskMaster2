import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TaskHeader from './TaskHeader'
import type { Task } from '@/types'

const mockAddToast = vi.fn()
const mockUpdateTask = vi.fn()

vi.mock('@/store/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'admin', role: 'manager', email: 'admin@test.com', team_id: 1, terms_accepted: true, privacy_accepted: true, marketing_consent: false, consented_at: null, created_at: '2024-01-01T00:00:00Z' },
  }),
}))

vi.mock('@/store/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}))

vi.mock('@/api/client', () => ({
  api: {
    tasks: {
      update: vi.fn().mockResolvedValue({
        id: 1,
        title: 'Test Task',
        assignees: [],
        priority: 'medium',
        project: 'Test',
        project_id: null,
        project_info: null,
        due_date: null,
        notes: '',
        completed: false,
        status: 'todo',
        comments: [],
        subtasks: [],
        dependencies: [],
        blocked_by: [],
        blocking: [],
        is_blocked: false,
        created_at: '2024-01-01T00:00:00Z',
      }),
    },
  },
}))

const makeTask = (id: number, overrides: Partial<Task> = {}): Task => ({
  id,
  title: 'Test Task',
  priority: 'medium',
  status: 'todo',
  completed: false,
  project: 'Test Project',
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
  ...overrides,
})

const defaultProps = {
  task: makeTask(1),
  isBlocked: false,
  blockedByCount: 0,
  openSubtasks: 0,
  hasOpenSubtasks: false,
  completionBlocked: false,
  completionBlockedTitle: undefined,
  canStartTask: true,
  onEdit: vi.fn(),
  onComplete: vi.fn(),
  onStart: vi.fn(),
  onDelete: vi.fn(),
  onUpdate: mockUpdateTask,
}

describe('TaskHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders task title and project', () => {
    render(<TaskHeader {...defaultProps} />)
    expect(screen.getByText('Test Task')).toBeInTheDocument()
    expect(screen.getByText('Test Project')).toBeInTheDocument()
  })

  it('shows priority badge', () => {
    render(<TaskHeader {...defaultProps} />)
    expect(screen.getByText('Średni')).toBeInTheDocument()
  })

  it('shows status badge', () => {
    render(<TaskHeader {...defaultProps} />)
    // statusLabel returns "Status: do zrobienia" for todo
    expect(screen.getByText('Status: do zrobienia')).toBeInTheDocument()
  })

  it('shows blocked badge when task is blocked', () => {
    render(<TaskHeader {...defaultProps} isBlocked={true} blockedByCount={2} />)
    expect(screen.getByText('Zablokowane przez 2')).toBeInTheDocument()
  })

  it('shows open subtasks badge', () => {
    render(<TaskHeader {...defaultProps} hasOpenSubtasks={true} openSubtasks={3} />)
    expect(screen.getByText('Otwarte podzadania: 3')).toBeInTheDocument()
  })

  it('shows due date when present', () => {
    render(<TaskHeader {...defaultProps} task={makeTask(1, { due_date: '2024-12-25' })} />)
    expect(screen.getByText('2024-12-25')).toBeInTheDocument()
  })

  it('shows "Nieprzypisane" when no assignees', () => {
    render(<TaskHeader {...defaultProps} />)
    expect(screen.getByText(/Nieprzypisane/)).toBeInTheDocument()
  })

  it('shows assignee names when present', () => {
    const task = makeTask(1, {
      assignees: [{ id: 2, username: 'Jan', email: 'jan@test.com', role: 'user', team_id: 1, terms_accepted: true, privacy_accepted: true, marketing_consent: false, consented_at: null, created_at: '' }],
    })
    render(<TaskHeader {...defaultProps} task={task} />)
    expect(screen.getByText(/Jan/)).toBeInTheDocument()
  })

  it('shows admin buttons (Edit, Delete) for admin users', () => {
    render(<TaskHeader {...defaultProps} />)
    expect(screen.getByText('Edytuj')).toBeInTheDocument()
    expect(screen.getByText('Usuń zadanie')).toBeInTheDocument()
  })

  it('shows "Ustaw w toku" button when canStartTask is true', () => {
    render(<TaskHeader {...defaultProps} canStartTask={true} />)
    expect(screen.getByText('Ustaw w toku')).toBeInTheDocument()
  })

  it('hides "Ustaw w toku" when canStartTask is false', () => {
    render(<TaskHeader {...defaultProps} canStartTask={false} />)
    expect(screen.queryByText('Ustaw w toku')).not.toBeInTheDocument()
  })

  it('shows "Oznacz jako zakończone" when task is not completed', () => {
    render(<TaskHeader {...defaultProps} />)
    expect(screen.getByText('Oznacz jako zakończone')).toBeInTheDocument()
  })

  it('shows "Przywróć zadanie" when task is completed', () => {
    render(<TaskHeader {...defaultProps} task={makeTask(1, { completed: true })} />)
    expect(screen.getByText('Przywróć zadanie')).toBeInTheDocument()
  })

  it('complete button is disabled when completionBlocked', () => {
    render(<TaskHeader {...defaultProps} completionBlocked={true} />)
    expect(screen.getByText('Oznacz jako zakończone')).toBeDisabled()
  })

  it('complete button is enabled when not blocked', () => {
    render(<TaskHeader {...defaultProps} completionBlocked={false} />)
    expect(screen.getByText('Oznacz jako zakończone')).toBeEnabled()
  })

  it('calls onEdit when edit button clicked', () => {
    const onEdit = vi.fn()
    render(<TaskHeader {...defaultProps} onEdit={onEdit} />)
    fireEvent.click(screen.getByText('Edytuj'))
    expect(onEdit).toHaveBeenCalled()
  })

  it('calls onComplete when complete button clicked', () => {
    const onComplete = vi.fn()
    render(<TaskHeader {...defaultProps} onComplete={onComplete} completionBlocked={false} />)
    fireEvent.click(screen.getByText('Oznacz jako zakończone'))
    expect(onComplete).toHaveBeenCalled()
  })

  it('calls onStart when start button clicked', () => {
    const onStart = vi.fn()
    render(<TaskHeader {...defaultProps} onStart={onStart} canStartTask={true} />)
    fireEvent.click(screen.getByText('Ustaw w toku'))
    expect(onStart).toHaveBeenCalled()
  })

  it('calls onDelete when delete button clicked', () => {
    const onDelete = vi.fn()
    render(<TaskHeader {...defaultProps} onDelete={onDelete} />)
    fireEvent.click(screen.getByText('Usuń zadanie'))
    expect(onDelete).toHaveBeenCalled()
  })

  it('shows created_at timestamp', () => {
    render(<TaskHeader {...defaultProps} />)
    expect(screen.getByText(/2024/)).toBeInTheDocument()
  })

  it('shows "Usuń przypisanie" button when admin and assignees exist', () => {
    const task = makeTask(1, {
      assignees: [{ id: 2, username: 'Jan', email: 'jan@test.com', role: 'user', team_id: 1, terms_accepted: true, privacy_accepted: true, marketing_consent: false, consented_at: null, created_at: '' }],
    })
    render(<TaskHeader {...defaultProps} task={task} />)
    expect(screen.getByText('Usuń przypisanie')).toBeInTheDocument()
  })

  it('does not show "Usuń przypisanie" when no assignees', () => {
    render(<TaskHeader {...defaultProps} />)
    expect(screen.queryByText('Usuń przypisanie')).not.toBeInTheDocument()
  })
})
