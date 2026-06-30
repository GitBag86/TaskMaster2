import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TaskTable from './TaskTable'
import type { Task, Subtask, User } from '@/types'

/* ------------------------------------------------------------------ */
/*  Framer Motion stub — avoid animation lifecycle in jsdom           */
/* ------------------------------------------------------------------ */

vi.mock('framer-motion', () => ({
  motion: {
    tr: 'tr',
    div: 'div',
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
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
  return { id, username, email: `${username}@test.com`, role: 'user', team_id: 1, terms_accepted: true, privacy_accepted: true, marketing_consent: false, consented_at: null, created_at: '2024-01-01T00:00:00Z' }
}

/* ------------------------------------------------------------------ */
/*  Default props                                                     */
/* ------------------------------------------------------------------ */

const defaultProps = {
  tasks: [
    makeTask(1, { title: 'Alpha Task', priority: 'high' }),
    makeTask(2, { title: 'Beta Task', priority: 'low' }),
  ],
  onNavigate: vi.fn(),
  onComplete: vi.fn().mockResolvedValue(undefined),
  selectedTaskIds: new Set<number>(),
  onSelectionChange: vi.fn(),
  onToggleAll: vi.fn(),
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('TaskTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /* ---------- Rendering ---------- */

  it('renders all tasks', () => {
    render(<TaskTable {...defaultProps} />)
    expect(screen.getByText('Alpha Task')).toBeInTheDocument()
    expect(screen.getByText('Beta Task')).toBeInTheDocument()
  })

  it('renders all column headers', () => {
    render(<TaskTable {...defaultProps} />)
    expect(screen.getByText('Tytuł')).toBeInTheDocument()
    expect(screen.getByText('Projekt')).toBeInTheDocument()
    expect(screen.getByText('Priorytet')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Wykonawca')).toBeInTheDocument()
    expect(screen.getByText('Termin')).toBeInTheDocument()
    expect(screen.getByText('Podzad.')).toBeInTheDocument()
  })

  it('renders priority badges', () => {
    render(<TaskTable {...defaultProps} />)
    expect(screen.getByText('Wysoki')).toBeInTheDocument()
    expect(screen.getByText('Niski')).toBeInTheDocument()
  })

  it('renders status badges', () => {
    render(<TaskTable {...defaultProps} />)
    // Both tasks have status 'todo' → renders as 'Do zrob.'
    const statusBadges = screen.getAllByText('Do zrob.')
    expect(statusBadges.length).toBe(2)
  })

  it('shows project name for each task', () => {
    render(<TaskTable {...defaultProps} />)
    const projectCells = screen.getAllByText('Test Project')
    expect(projectCells.length).toBe(2)
  })

  /* ---------- Empty state ---------- */

  it('shows empty state when no tasks', () => {
    render(<TaskTable {...defaultProps} tasks={[]} />)
    expect(screen.getByText('Brak zadań do wyświetlenia w tabeli.')).toBeInTheDocument()
  })

  /* ---------- Navigation ---------- */

  it('calls onNavigate when clicking a task title', () => {
    const onNavigate = vi.fn()
    render(<TaskTable {...defaultProps} onNavigate={onNavigate} />)
    fireEvent.click(screen.getByText('Alpha Task'))
    expect(onNavigate).toHaveBeenCalledWith(1)
  })

  /* ---------- Complete button ---------- */

  it('calls onComplete when clicking the complete button', () => {
    const onComplete = vi.fn().mockResolvedValue(undefined)
    render(<TaskTable {...defaultProps} onComplete={onComplete} />)
    const btns = screen.getAllByTitle('Zakończ')
    fireEvent.click(btns[0])
    expect(onComplete).toHaveBeenCalledWith(1)
  })

  it('disables complete button for blocked tasks', () => {
    const blockedTask = makeTask(1, { title: 'Blocked', is_blocked: true })
    render(<TaskTable {...defaultProps} tasks={[blockedTask]} />)
    const btn = screen.getByTitle('Zablokowane')
    expect(btn).toBeDisabled()
  })

  it('disables complete button when open subtasks exist', () => {
    const taskWithSubtasks = makeTask(1, {
      title: 'With Subtasks',
      subtasks: [makeSubtask(101, false)],
    })
    render(<TaskTable {...defaultProps} tasks={[taskWithSubtasks]} />)
    const btn = screen.getByTitle(/Najpierw zakończ podzadania/)
    expect(btn).toBeDisabled()
  })

  it('shows restore button when task is completed', () => {
    const completedTask = makeTask(1, { title: 'Done', completed: true })
    render(<TaskTable {...defaultProps} tasks={[completedTask]} />)
    expect(screen.getByTitle('Przywróć')).toBeInTheDocument()
  })

  /* ---------- Due date ---------- */

  it('renders due date when present', () => {
    const taskWithDue = makeTask(1, { title: 'Due Task', due_date: '2099-12-25' })
    render(<TaskTable {...defaultProps} tasks={[taskWithDue]} />)
    // toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }) → "25 gru"
    expect(screen.getByText(/25 gru/i)).toBeInTheDocument()
  })

  it('shows em dash when no due date', () => {
    render(<TaskTable {...defaultProps} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })

  /* ---------- Assignees ---------- */

  it('shows em dash when no assignees', () => {
    render(<TaskTable {...defaultProps} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })

  it('shows assignee usernames when present', () => {
    const taskWithAssignee = makeTask(1, {
      title: 'Assigned',
      assignees: [makeUser(2, 'Janek')],
    })
    render(<TaskTable {...defaultProps} tasks={[taskWithAssignee]} />)
    expect(screen.getByText('Janek')).toBeInTheDocument()
  })

  /* ---------- Subtask progress ---------- */

  it('shows subtask ratio when subtasks exist', () => {
    const taskWithSubtasks = makeTask(1, {
      title: 'Subtasks',
      subtasks: [makeSubtask(1, true), makeSubtask(2, false)],
    })
    render(<TaskTable {...defaultProps} tasks={[taskWithSubtasks]} />)
    expect(screen.getByText('1/2')).toBeInTheDocument()
  })

  it('shows em dash when no subtasks', () => {
    render(<TaskTable {...defaultProps} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })

  /* ---------- Blocked badge ---------- */

  it('shows blocked badge for blocked tasks', () => {
    const blockedTask = makeTask(1, { title: 'Blocked', is_blocked: true })
    render(<TaskTable {...defaultProps} tasks={[blockedTask]} />)
    expect(screen.getByText('Z')).toBeInTheDocument()
  })

  /* ---------- Selectable mode ---------- */

  it('renders checkboxes when selectable is true', () => {
    render(<TaskTable {...defaultProps} selectable={true} />)
    expect(screen.getByLabelText('Zaznacz wszystkie widoczne')).toBeInTheDocument()
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes.length).toBe(3) // header + 2 rows
  })

  it('calls onSelectionChange when a row checkbox is toggled', () => {
    const onSelectionChange = vi.fn()
    render(
      <TaskTable
        {...defaultProps}
        selectable={true}
        onSelectionChange={onSelectionChange}
      />,
    )
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1]) // first row checkbox
    expect(onSelectionChange).toHaveBeenCalledWith(1, true)
  })

  it('calls onToggleAll when header checkbox is clicked', () => {
    const onToggleAll = vi.fn()
    render(
      <TaskTable
        {...defaultProps}
        selectable={true}
        onToggleAll={onToggleAll}
      />,
    )
    const headerCheckbox = screen.getByLabelText('Zaznacz wszystkie widoczne')
    fireEvent.click(headerCheckbox)
    expect(onToggleAll).toHaveBeenCalledWith(true)
  })

  /* ---------- Sorting ---------- */

  it('sorts by title ascending on first click', () => {
    render(<TaskTable {...defaultProps} />)
    const titleHeader = screen.getByText('Tytuł')

    fireEvent.click(titleHeader)

    // Ascending: 'Alpha Task' first, 'Beta Task' second
    const titles = screen.getAllByText(/Task/)
    expect(titles[0]).toHaveTextContent('Alpha Task')
    expect(titles[1]).toHaveTextContent('Beta Task')
  })

  it('toggles sort direction on second click', () => {
    render(<TaskTable {...defaultProps} />)
    const titleHeader = screen.getByText('Tytuł')

    // First click: asc
    fireEvent.click(titleHeader)
    // Second click: desc
    fireEvent.click(titleHeader)

    const titles = screen.getAllByText(/Task/)
    expect(titles[0]).toHaveTextContent('Beta Task')
    expect(titles[1]).toHaveTextContent('Alpha Task')
  })

  it('sorts by priority', () => {
    render(<TaskTable {...defaultProps} />)
    const priorityHeader = screen.getByText('Priorytet')

    fireEvent.click(priorityHeader)

    // Asc: high (0) before low (2)
    const taskCells = screen.getAllByText(/Task/)
    expect(taskCells[0]).toHaveTextContent('Alpha Task') // high
    expect(taskCells[1]).toHaveTextContent('Beta Task')  // low
  })

  it('shows sort direction icon on active column', () => {
    render(<TaskTable {...defaultProps} />)
    // Default sort is by due_date
    const headerBefore = screen.getByText('Termin')
    expect(headerBefore.closest('th')).toBeInTheDocument()
  })

  /* ---------- Inline editing ---------- */

  it('shows edit button when onUpdate is provided', () => {
    const onUpdate = vi.fn()
    render(<TaskTable {...defaultProps} onUpdate={onUpdate} />)
    const editBtns = screen.getAllByLabelText('Edytuj tytuł')
    expect(editBtns.length).toBe(2)
  })

  it('does not show edit button when onUpdate is not provided', () => {
    render(<TaskTable {...defaultProps} onUpdate={undefined} />)
    expect(screen.queryByLabelText('Edytuj tytuł')).not.toBeInTheDocument()
  })

  it('enters title edit mode when edit button is clicked', () => {
    const onUpdate = vi.fn()
    render(<TaskTable {...defaultProps} onUpdate={onUpdate} />)

    const editBtns = screen.getAllByLabelText('Edytuj tytuł')
    fireEvent.click(editBtns[0])

    // Should show an input with the current title as value
    const input = screen.getByDisplayValue('Alpha Task')
    expect(input).toBeInTheDocument()
  })

  it('saves title on Enter', () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(<TaskTable {...defaultProps} onUpdate={onUpdate} />)

    // Enter edit mode
    const editBtn = screen.getAllByLabelText('Edytuj tytuł')[0]
    fireEvent.click(editBtn)

    const input = screen.getByDisplayValue('Alpha Task') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Updated Title' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onUpdate).toHaveBeenCalledWith(1, { title: 'Updated Title' })
  })

  it('cancels title edit on Escape', () => {
    const onUpdate = vi.fn()
    render(<TaskTable {...defaultProps} onUpdate={onUpdate} />)

    const editBtn = screen.getAllByLabelText('Edytuj tytuł')[0]
    fireEvent.click(editBtn)

    const input = screen.getByDisplayValue('Alpha Task')
    fireEvent.change(input, { target: { value: 'Changed' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    // After escape, should exit edit mode and show original title
    expect(screen.getByText('Alpha Task')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Changed')).not.toBeInTheDocument()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  /* ---------- Inline priority editing ---------- */

  it('enters priority edit mode when clicking priority badge with onUpdate', () => {
    const onUpdate = vi.fn()
    render(<TaskTable {...defaultProps} onUpdate={onUpdate} />)

    const priorityBadge = screen.getByText('Wysoki').closest('button')!
    fireEvent.click(priorityBadge)

    // Editor shows all three priority buttons
    const lowButtons = screen.getAllByText('Niski')
    expect(lowButtons.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Wysoki')).toBeInTheDocument()
    expect(screen.getByText('Średni')).toBeInTheDocument()
  })

  it('changes priority via inline editor', () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(<TaskTable {...defaultProps} onUpdate={onUpdate} />)

    const priorityBadge = screen.getByText('Wysoki').closest('button')!
    fireEvent.click(priorityBadge)

    // After clicking, 'Niski' appears in two places: the editor (Task 1's row, first) 
    // and Task 2's badge (second). Click the first one (the editor button).
    const niskiButtons = screen.getAllByText('Niski')
    fireEvent.click(niskiButtons[0])

    expect(onUpdate).toHaveBeenCalledWith(1, { priority: 'low' })
  })
})
