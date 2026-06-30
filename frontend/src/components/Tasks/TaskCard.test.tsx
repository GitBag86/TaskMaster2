import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TaskCard from './TaskCard'
import type { Task, Subtask, User } from '@/types'

/* ------------------------------------------------------------------ */
/*  DnD mocks — avoid @dnd-kit dependency in unit tests               */
/* ------------------------------------------------------------------ */

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
    attributes: {},
    listeners: {},
  }),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))

/* ------------------------------------------------------------------ */
/*  Framer Motion stub                                                */
/* ------------------------------------------------------------------ */

vi.mock('framer-motion', () => ({
  motion: {
    div: 'div',
  },
}))

/* ------------------------------------------------------------------ */
/*  Context & API mocks                                               */
/* ------------------------------------------------------------------ */

const mockAddToast = vi.fn()

vi.mock('@/store/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}))

vi.mock('@/api/client', () => ({
  api: {
    users: {
      getAll: vi.fn().mockResolvedValue({ users: [] }),
    },
  },
}))

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeTask(id: number, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
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
  }
}

function makeSubtask(id: number, completed = false): Subtask {
  return { id, task_id: 1, title: `Sub ${id}`, completed }
}

function makeUser(id: number, username: string): User {
  return {
    id, username, email: `${username}@test.com`, role: 'user' as const,
    team_id: 1, terms_accepted: true, privacy_accepted: true,
    marketing_consent: false, consented_at: null, created_at: '2024-01-01T00:00:00Z',
  }
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('TaskCard', () => {
  const mockOnClick = vi.fn()
  const mockOnComplete = vi.fn()

  const defaultProps = {
    task: makeTask(1),
    onClick: mockOnClick,
    onComplete: mockOnComplete,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  /* ---------- Basic rendering ---------- */

  it('renders task title', () => {
    render(<TaskCard {...defaultProps} />)
    expect(screen.getByText('Task 1')).toBeInTheDocument()
  })

  it('renders project name', () => {
    render(<TaskCard {...defaultProps} />)
    expect(screen.getByText('Test Project')).toBeInTheDocument()
  })

  it('renders priority badge (Średni for medium)', () => {
    render(<TaskCard {...defaultProps} />)
    expect(screen.getByText('Średni')).toBeInTheDocument()
  })

  it('renders priority badge for high', () => {
    render(<TaskCard {...defaultProps} task={makeTask(1, { priority: 'high' })} />)
    expect(screen.getByText('Wysoki')).toBeInTheDocument()
  })

  it('renders priority badge for low', () => {
    render(<TaskCard {...defaultProps} task={makeTask(1, { priority: 'low' })} />)
    expect(screen.getByText('Niski')).toBeInTheDocument()
  })

  it('renders status badge (todo)', () => {
    render(<TaskCard {...defaultProps} />)
    expect(screen.getByText('Do zrobienia')).toBeInTheDocument()
  })

  it('renders status badge for in_progress', () => {
    render(<TaskCard {...defaultProps} task={makeTask(1, { status: 'in_progress' })} />)
    expect(screen.getByText('W toku')).toBeInTheDocument()
  })

  it('renders status badge for done', () => {
    render(<TaskCard {...defaultProps} task={makeTask(1, { status: 'done' })} />)
    expect(screen.getByText('Zakończone')).toBeInTheDocument()
  })

  it('shows "Nieprzypisane" when no assignees', () => {
    render(<TaskCard {...defaultProps} />)
    expect(screen.getByText('Nieprzypisane')).toBeInTheDocument()
  })

  it('shows assignee names when present', () => {
    const task = makeTask(1, { assignees: [makeUser(2, 'Janek')] })
    render(<TaskCard {...defaultProps} task={task} />)
    expect(screen.getByText('Janek')).toBeInTheDocument()
  })

  it('renders due date when present', () => {
    const task = makeTask(1, { title: 'Due Task', due_date: '2099-12-25' })
    render(<TaskCard {...defaultProps} task={task} />)
    expect(screen.getByText(/25 gru/i)).toBeInTheDocument()
  })

  it('shows "Po terminie" for overdue tasks', () => {
    const pastDate = '2020-01-15'
    const task = makeTask(1, { due_date: pastDate })
    render(<TaskCard {...defaultProps} task={task} />)
    expect(screen.getByText(/Po terminie/)).toBeInTheDocument()
  })

  /* ---------- Blocked badge ---------- */

  it('shows blocked badge with count', () => {
    const task = makeTask(1, {
      is_blocked: true,
      blocked_by: [{ id: 2, title: 'Blocker', status: 'todo', completed: false, project: '', due_date: null }],
    })
    render(<TaskCard {...defaultProps} task={task} />)
    expect(screen.getByText('Zablokowane: 1')).toBeInTheDocument()
  })

  it('shows open subtasks badge', () => {
    const task = makeTask(1, { subtasks: [makeSubtask(1, false)] })
    render(<TaskCard {...defaultProps} task={task} />)
    expect(screen.getByText(/Podzadania: 1/)).toBeInTheDocument()
  })

  /* ---------- Subtask progress ---------- */

  it('shows subtask progress', () => {
    const task = makeTask(1, {
      subtasks: [makeSubtask(1, true), makeSubtask(2, false)],
    })
    render(<TaskCard {...defaultProps} task={task} />)
    expect(screen.getByText('1/2')).toBeInTheDocument()
  })

  /* ---------- Navigation click ---------- */

  it('calls onClick when clicking the card', () => {
    const onClick = vi.fn()
    render(<TaskCard {...defaultProps} onClick={onClick} />)
    // Click the card container — the outermost motion.div
    const card = screen.getByText('Task 1').closest('.card')!
    fireEvent.click(card)
    expect(onClick).toHaveBeenCalled()
  })

  /* ---------- Complete button ---------- */

  it('calls onComplete when clicking the complete button', () => {
    const onComplete = vi.fn()
    render(<TaskCard {...defaultProps} onComplete={onComplete} />)
    const btn = screen.getByTitle('Zakończ zadanie')
    fireEvent.click(btn)
    expect(onComplete).toHaveBeenCalled()
  })

  it('does not call onComplete when task is blocked', () => {
    const onComplete = vi.fn()
    const task = makeTask(1, {
      is_blocked: true,
      blocked_by: [{ id: 2, title: 'Blocker', status: 'todo', completed: false, project: '', due_date: null }],
    })
    render(<TaskCard {...defaultProps} task={task} onComplete={onComplete} />)
    const btn = screen.getByTitle('Zadanie zablokowane przez zależności')
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('does not call onComplete when open subtasks exist', () => {
    const onComplete = vi.fn()
    const task = makeTask(1, { subtasks: [makeSubtask(1, false)] })
    render(<TaskCard {...defaultProps} task={task} onComplete={onComplete} />)
    const btn = screen.getByTitle(/Najpierw zakończ podzadania/)
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('shows restore button when task is completed', () => {
    const task = makeTask(1, { completed: true })
    render(<TaskCard {...defaultProps} task={task} />)
    expect(screen.getByTitle('Przywróć zadanie')).toBeInTheDocument()
  })

  /* ---------- Selectable mode ---------- */

  it('renders checkbox when selectable is true', () => {
    render(<TaskCard {...defaultProps} selectable={true} />)
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeInTheDocument()
  })

  it('calls onSelectionChange when checkbox is toggled', () => {
    const onSelectionChange = vi.fn()
    render(
      <TaskCard
        {...defaultProps}
        selectable={true}
        onSelectionChange={onSelectionChange}
      />,
    )
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(onSelectionChange).toHaveBeenCalledWith(true)
  })

  it('checkbox reflects selected state', () => {
    render(
      <TaskCard
        {...defaultProps}
        selectable={true}
        selected={true}
      />,
    )
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  /* ---------- Drag handle ---------- */

  it('shows drag handle when onUpdate is provided and task is not completed', () => {
    render(<TaskCard {...defaultProps} onUpdate={vi.fn()} />)
    expect(screen.getByLabelText('Przeciągnij, aby zmienić kolejność')).toBeInTheDocument()
  })

  it('hides drag handle when onUpdate is not provided', () => {
    render(<TaskCard {...defaultProps} />)
    expect(screen.queryByLabelText('Przeciągnij, aby zmienić kolejność')).not.toBeInTheDocument()
  })

  it('hides drag handle when task is completed', () => {
    const task = makeTask(1, { completed: true })
    render(<TaskCard {...defaultProps} task={task} onUpdate={vi.fn()} />)
    expect(screen.queryByLabelText('Przeciągnij, aby zmienić kolejność')).not.toBeInTheDocument()
  })

  /* ---------- Inline title editing ---------- */

  it('enters title edit mode when clicking the title with onUpdate', () => {
    render(<TaskCard {...defaultProps} onUpdate={vi.fn()} />)
    const title = screen.getByText('Task 1')
    fireEvent.click(title)
    const input = screen.getByDisplayValue('Task 1')
    expect(input).toBeInTheDocument()
  })

  it('does not enter title edit mode when onUpdate is not provided', () => {
    render(<TaskCard {...defaultProps} />)
    const title = screen.getByText('Task 1')
    fireEvent.click(title)
    // onClick should fire for navigation, not edit mode
    expect(screen.queryByDisplayValue('Task 1')).not.toBeInTheDocument()
  })

  it('saves title on Enter', () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(<TaskCard {...defaultProps} onUpdate={onUpdate} />)

    const title = screen.getByText('Task 1')
    fireEvent.click(title)

    const input = screen.getByDisplayValue('Task 1') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Updated Title' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onUpdate).toHaveBeenCalledWith(1, { title: 'Updated Title' })
  })

  it('cancels title edit on Escape', () => {
    const onUpdate = vi.fn()
    render(<TaskCard {...defaultProps} onUpdate={onUpdate} />)

    const title = screen.getByText('Task 1')
    fireEvent.click(title)

    const input = screen.getByDisplayValue('Task 1')
    fireEvent.change(input, { target: { value: 'Changed' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.getByText('Task 1')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Changed')).not.toBeInTheDocument()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  /* ---------- Inline priority editing ---------- */

  it('enters priority edit mode when clicking the priority badge (with onUpdate)', () => {
    render(<TaskCard {...defaultProps} onUpdate={vi.fn()} />)
    const priorityBadge = screen.getByText('Średni')
    fireEvent.click(priorityBadge)

    expect(screen.getByText('Wysoki')).toBeInTheDocument()
    expect(screen.getByText('Średni')).toBeInTheDocument()
    expect(screen.getByText('Niski')).toBeInTheDocument()
  })

  it('changes priority via inline editor', () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(<TaskCard {...defaultProps} onUpdate={onUpdate} />)

    const priorityBadge = screen.getByText('Średni')
    fireEvent.click(priorityBadge)

    // The editor shows three buttons. Click 'Niski' — there's only one 'Niski'
    // since all three priority buttons are in the editor (the original badge is replaced)
    const lowBtn = screen.getByText('Niski')
    fireEvent.click(lowBtn)

    expect(onUpdate).toHaveBeenCalledWith(1, { priority: 'low' })
  })

  it('changes priority to high via inline editor', () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(<TaskCard {...defaultProps} onUpdate={onUpdate} />)

    const priorityBadge = screen.getByText('Średni')
    fireEvent.click(priorityBadge)

    const highBtn = screen.getByText('Wysoki')
    fireEvent.click(highBtn)

    expect(onUpdate).toHaveBeenCalledWith(1, { priority: 'high' })
  })

  /* ---------- Inline assignee editing ---------- */

  it('enters assignee edit mode when clicking assignee area (with onUpdate)', async () => {
    render(<TaskCard {...defaultProps} onUpdate={vi.fn()} />)
    const assigneeArea = screen.getByText('Nieprzypisane')
    fireEvent.click(assigneeArea)

    // Wait for api.users.getAll() to resolve and dropdown to render
    expect(await screen.findByText('— Nieprzypisane')).toBeInTheDocument()
  })

  it('unassigns user via inline assignee editor', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    const task = makeTask(1, { assignees: [makeUser(2, 'Janek')] })
    render(<TaskCard {...defaultProps} task={task} onUpdate={onUpdate} />)

    // Click the assignee area (shows "Janek")
    const assigneeArea = screen.getByText('Janek')
    fireEvent.click(assigneeArea)

    // Wait for dropdown to render
    const unassignBtn = await screen.findByText('— Nieprzypisane')
    fireEvent.click(unassignBtn)

    expect(onUpdate).toHaveBeenCalledWith(1, { assignee_ids: [] })
  })

  it('does not enter assignee edit mode when onUpdate is not provided', () => {
    render(<TaskCard {...defaultProps} />)
    const assigneeArea = screen.getByText('Nieprzypisane')
    fireEvent.click(assigneeArea)
    // Should not show the dropdown
    expect(screen.queryByText('— Nieprzypisane')).not.toBeInTheDocument()
  })

  /* ---------- Framer motion entering animation ---------- */

  it('renders with framer-motion motion.div wrapper', () => {
    const { container } = render(<TaskCard {...defaultProps} />)
    // The outermost element should be a div (from motion.div mock)
    const outerDiv = container.firstElementChild
    expect(outerDiv?.tagName).toBe('DIV')
    expect(outerDiv?.classList.contains('card')).toBe(true)
  })
})
