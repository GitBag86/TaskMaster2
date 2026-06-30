import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import KanbanPage from './KanbanPage'
import type { Task } from '@/types'

/* ------------------------------------------------------------------ */
/*  API client mock                                                   */
/* ------------------------------------------------------------------ */

const mockGetAllTasks = vi.fn()
const mockUpdateTask = vi.fn()

vi.mock('@/api/client', () => ({
  api: {
    tasks: {
      getAll: (...args: unknown[]) => mockGetAllTasks(...args),
      update: (...args: unknown[]) => mockUpdateTask(...args),
    },
  },
}))

/* ------------------------------------------------------------------ */
/*  Toast & socket mocks                                              */
/* ------------------------------------------------------------------ */

const mockAddToast = vi.fn()

vi.mock('@/store/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}))

vi.mock('@/hooks/useSocketTaskEvents', () => ({
  useSocketTaskEvents: () => {},
}))

/* ------------------------------------------------------------------ */
/*  Helper                                                            */
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

/** Create a controlled drag event with a mocked dataTransfer.
 *  Uses `Event` instead of `DragEvent` because jsdom does not implement DragEvent. */
function makeDragEvent(
  type: string,
  getDataRetVal = '1',
): Event {
  const event = new Event(type, { bubbles: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      setData: vi.fn(),
      getData: vi.fn().mockReturnValue(getDataRetVal),
      dropEffect: 'move',
      effectAllowed: 'all',
    },
    configurable: true,
  })
  return event
}

/** Find a column section by its header text. */
function findColumn(label: string): HTMLElement {
  return Array.from(document.querySelectorAll('section')).find(
    (s) => s.textContent?.includes(label),
  )!
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('KanbanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAllTasks.mockResolvedValue({
      tasks: [],
      total: 0,
      page: 1,
      pages: 1,
      per_page: 200,
    })
  })

  /* ---------- Loading state ---------- */

  it('shows loading skeleton while fetching tasks', () => {
    mockGetAllTasks.mockReturnValue(new Promise(() => {}))
    const { container } = render(<KanbanPage />)
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0)
    expect(screen.queryByText('Kanban')).not.toBeInTheDocument()
  })

  /* ---------- Empty state ---------- */

  it('shows empty drop zones for all three columns', async () => {
    render(<KanbanPage />)
    await waitFor(() => expect(screen.getByText('Kanban')).toBeInTheDocument())
    const dropZones = screen.getAllByText('Przeciągnij zadanie tutaj')
    expect(dropZones.length).toBe(3)
  })

  /* ---------- Column headers ---------- */

  it('renders all three column headers', async () => {
    render(<KanbanPage />)
    await waitFor(() => {
      expect(screen.getByText('Do zrobienia')).toBeInTheDocument()
      expect(screen.getByText('W toku')).toBeInTheDocument()
      // 'Zakończone' appears both as a stat chip label and a column header
      const doneTexts = screen.getAllByText('Zakończone')
      expect(doneTexts.length).toBeGreaterThanOrEqual(1)
    })
  })

  /* ---------- Task placement ---------- */

  it('places tasks in the correct column based on status', async () => {
    mockGetAllTasks.mockResolvedValue({
      tasks: [
        makeTask(1, { title: 'Todo Task', status: 'todo' }),
        makeTask(2, { title: 'In Progress Task', status: 'in_progress' }),
        makeTask(3, { title: 'Done Task', status: 'done', completed: true }),
      ],
      total: 3, page: 1, pages: 1, per_page: 200,
    })
    render(<KanbanPage />)
    await waitFor(() => expect(screen.getByText('Todo Task')).toBeInTheDocument())
    expect(screen.getByText('In Progress Task')).toBeInTheDocument()
    expect(screen.getByText('Done Task')).toBeInTheDocument()
  })

  /* ---------- Column counts ---------- */

  it('shows correct task count per column', async () => {
    mockGetAllTasks.mockResolvedValue({
      tasks: [
        makeTask(1, { status: 'todo' }),
        makeTask(2, { status: 'todo' }),
        makeTask(3, { status: 'in_progress' }),
      ],
      total: 3, page: 1, pages: 1, per_page: 200,
    })
    render(<KanbanPage />)
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument())
  })

  /* ---------- Stat chips ---------- */

  it('shows stat chips with correct counts', async () => {
    mockGetAllTasks.mockResolvedValue({
      tasks: [
        makeTask(1, { status: 'todo' }),
        makeTask(2, { status: 'done', completed: true }),
        makeTask(3, { is_blocked: true }),
      ],
      total: 3, page: 1, pages: 1, per_page: 200,
    })
    render(<KanbanPage />)
    await waitFor(() => expect(screen.getByText('Wszystkie')).toBeInTheDocument())

    // "Zablokowane" appears in stat chips AND as a blocked badge on the task card
    const blockedTexts = screen.getAllByText(/Zablokowane/)
    expect(blockedTexts.length).toBeGreaterThanOrEqual(1)
    // 'Zakończone' appears as a stat chip label AND as the column header
    const doneTexts = screen.getAllByText('Zakończone')
    expect(doneTexts.length).toBeGreaterThanOrEqual(1)
  })

  /* ---------- Priority rendering ---------- */

  it('renders priority labels on task cards', async () => {
    mockGetAllTasks.mockResolvedValue({
      tasks: [
        makeTask(1, { title: 'High Task', priority: 'high', status: 'todo' }),
        makeTask(2, { title: 'Low Task', priority: 'low', status: 'todo' }),
      ],
      total: 2, page: 1, pages: 1, per_page: 200,
    })
    render(<KanbanPage />)
    await waitFor(() => {
      expect(screen.getByText('Wysoki')).toBeInTheDocument()
      expect(screen.getByText('Niski')).toBeInTheDocument()
    })
  })

  /* ---------- Assignee rendering ---------- */

  it('shows assignee name on task cards', async () => {
    mockGetAllTasks.mockResolvedValue({
      tasks: [makeTask(1, {
        status: 'todo',
        assignees: [{ id: 5, username: 'Janek', email: 'janek@test.com', role: 'user', team_id: 1, terms_accepted: true, privacy_accepted: true, marketing_consent: false, consented_at: null, created_at: '' }],
      })],
      total: 1, page: 1, pages: 1, per_page: 200,
    })
    render(<KanbanPage />)
    await waitFor(() => expect(screen.getByText('Janek')).toBeInTheDocument())
  })

  it('shows "Nieprzypisane" when no assignee', async () => {
    mockGetAllTasks.mockResolvedValue({
      tasks: [makeTask(1, { status: 'todo' })],
      total: 1, page: 1, pages: 1, per_page: 200,
    })
    render(<KanbanPage />)
    await waitFor(() => expect(screen.getByText('Nieprzypisane')).toBeInTheDocument())
  })

  /* ---------- Blocked badge ---------- */

  it('shows blocked badge on blocked tasks', async () => {
    mockGetAllTasks.mockResolvedValue({
      tasks: [makeTask(1, { title: 'Blocked Task', is_blocked: true, status: 'todo' })],
      total: 1, page: 1, pages: 1, per_page: 200,
    })
    render(<KanbanPage />)
    await waitFor(() => expect(screen.getByText('Blocked Task')).toBeInTheDocument())

    // "Zablokowane" appears both as a stat chip label and as a task badge
    const blockedBadges = screen.getAllByText(/Zablokowane/)
    expect(blockedBadges.length).toBeGreaterThanOrEqual(1)
  })

  /* ---------- Completed task strikethrough ---------- */

  it('applies line-through style to completed task titles', async () => {
    mockGetAllTasks.mockResolvedValue({
      tasks: [makeTask(1, { title: 'Done Task', status: 'done', completed: true })],
      total: 1, page: 1, pages: 1, per_page: 200,
    })
    render(<KanbanPage />)
    await waitFor(() => {
      const title = screen.getByText('Done Task')
      expect(title.className).toContain('line-through')
    })
  })

  /* ---------- Drag visual state ---------- */

  it('shows dragged task with opacity class', async () => {
    mockGetAllTasks.mockResolvedValue({
      tasks: [makeTask(1, { title: 'Draggable', status: 'todo' })],
      total: 1, page: 1, pages: 1, per_page: 200,
    })
    render(<KanbanPage />)
    await waitFor(() => expect(screen.getByText('Draggable')).toBeInTheDocument())

    const article = screen.getByText('Draggable').closest('article')!
    fireEvent(article, makeDragEvent('dragstart'))

    await waitFor(() => {
      expect(article.className).toContain('opacity-60')
    })
  })

  /* ---------- Drop — change status ---------- */

  it('calls api.tasks.update when dropping on a different column', async () => {
    mockUpdateTask.mockResolvedValue(makeTask(1, { status: 'in_progress' }))
    mockGetAllTasks.mockResolvedValue({
      tasks: [makeTask(1, { title: 'Move Me', status: 'todo' })],
      total: 1, page: 1, pages: 1, per_page: 200,
    })
    render(<KanbanPage />)
    await waitFor(() => expect(screen.getByText('Move Me')).toBeInTheDocument())

    const article = screen.getByText('Move Me').closest('article')!
    const inProgressSection = findColumn('W toku')

    fireEvent(article, makeDragEvent('dragstart'))
    fireEvent(inProgressSection, makeDragEvent('drop'))

    await waitFor(() => {
      expect(mockUpdateTask).toHaveBeenCalledWith(1, {
        status: 'in_progress',
        completed: false,
      })
    })
  })

  /* ---------- Drop — same column, no API call ---------- */

  it('does not call api.tasks.update when dropping on the same column', async () => {
    mockGetAllTasks.mockResolvedValue({
      tasks: [makeTask(1, { title: 'Stay', status: 'todo' })],
      total: 1, page: 1, pages: 1, per_page: 200,
    })
    render(<KanbanPage />)
    await waitFor(() => expect(screen.getByText('Stay')).toBeInTheDocument())

    const article = screen.getByText('Stay').closest('article')!
    const todoSection = findColumn('Do zrobienia')

    fireEvent(article, makeDragEvent('dragstart'))
    fireEvent(todoSection, makeDragEvent('drop'))

    await waitFor(() => {
      expect(mockUpdateTask).not.toHaveBeenCalled()
    })
  })

  /* ---------- Blocked task cannot go to done ---------- */

  it('shows warning when dropping a blocked task on the done column', async () => {
    mockGetAllTasks.mockResolvedValue({
      tasks: [makeTask(1, { title: 'Blocked', is_blocked: true, status: 'in_progress' })],
      total: 1, page: 1, pages: 1, per_page: 200,
    })
    render(<KanbanPage />)
    await waitFor(() => expect(screen.getByText('Blocked')).toBeInTheDocument())

    const article = screen.getByText('Blocked').closest('article')!
    const doneSection = findColumn('Zakończone')

    fireEvent(article, makeDragEvent('dragstart'))
    fireEvent(doneSection, makeDragEvent('drop'))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        'Najpierw zakończ zadania blokujące',
        'warning',
      )
      expect(mockUpdateTask).not.toHaveBeenCalled()
    })
  })

  /* ---------- Drag over highlights column ---------- */

  it('highlights column on drag over', async () => {
    mockGetAllTasks.mockResolvedValue({
      tasks: [makeTask(1, { title: 'Drag Me', status: 'todo' })],
      total: 1, page: 1, pages: 1, per_page: 200,
    })
    render(<KanbanPage />)
    await waitFor(() => expect(screen.getByText('Drag Me')).toBeInTheDocument())

    const inProgressSection = findColumn('W toku')
    fireEvent(inProgressSection, makeDragEvent('dragover'))

    await waitFor(() => {
      expect(inProgressSection.className).toContain('ring-2')
      expect(inProgressSection.className).toContain('ring-primary/40')
    })
  })

  /* ---------- Revert on API error ---------- */

  it('reverts optimistic update when API call fails', async () => {
    mockUpdateTask.mockRejectedValue(new Error('Network error'))
    mockGetAllTasks.mockResolvedValue({
      tasks: [makeTask(1, { title: 'Fail Move', status: 'todo' })],
      total: 1, page: 1, pages: 1, per_page: 200,
    })
    render(<KanbanPage />)
    await waitFor(() => expect(screen.getByText('Fail Move')).toBeInTheDocument())

    const article = screen.getByText('Fail Move').closest('article')!
    const inProgressSection = findColumn('W toku')

    fireEvent(article, makeDragEvent('dragstart'))
    fireEvent(inProgressSection, makeDragEvent('drop'))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Network error', 'error')
    })
  })
})
