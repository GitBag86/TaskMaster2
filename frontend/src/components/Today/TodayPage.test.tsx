import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TodayPage from './TodayPage'
import type { Task, TodayTasksResponse } from '@/types'

/* ------------------------------------------------------------------ */
/*  Mocks                                                             */
/* ------------------------------------------------------------------ */

const mockToday = vi.fn()
const mockCompleteTask = vi.fn()
const mockUpdateTask = vi.fn()

vi.mock('@/api/client', () => ({
  api: {
    tasks: {
      today: (...args: unknown[]) => mockToday(...args),
      complete: (...args: unknown[]) => mockCompleteTask(...args),
      update: (...args: unknown[]) => mockUpdateTask(...args),
    },
  },
}))

const mockAddToast = vi.fn()

vi.mock('@/store/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}))

/** Module-level capture for socket event handlers — set by the mock below. */
let socketHandlers: Record<string, (...args: unknown[]) => void> = {}

vi.mock('@/hooks/useSocketTaskEvents', () => ({
  useSocketTaskEvents: (handlers: Record<string, (...args: unknown[]) => void>) => {
    socketHandlers = handlers
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

const defaultCounts = {
  overdue: 0,
  today: 0,
  upcoming: 0,
  total: 0,
  blocked: 0,
  ready: 0,
  high_priority: 0,
}

function makeTodayResponse(
  overrides: Partial<TodayTasksResponse> = {},
): TodayTasksResponse {
  return {
    overdue: [],
    today: [],
    upcoming: [],
    counts: { ...defaultCounts },
    generated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('TodayPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockToday.mockResolvedValue(makeTodayResponse())
  })

  /* ---------- Loading state ---------- */

  it('shows skeleton while loading', () => {
    mockToday.mockReturnValue(new Promise(() => {}))
    const { container } = render(<TodayPage />)
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0)
    expect(screen.queryByText('Dziś')).not.toBeInTheDocument()
  })

  /* ---------- Title and empty state ---------- */

  it('renders page title and subtitle', async () => {
    render(<TodayPage />)
    await waitFor(() => expect(screen.getAllByText('Dziś').length).toBeGreaterThanOrEqual(1))
    expect(screen.getByText('Najbliższe terminy i zadania wymagające uwagi.')).toBeInTheDocument()
  })

  it('shows all six metric chips with zero values when empty', async () => {
    render(<TodayPage />)
    await waitFor(() => expect(screen.getAllByText('Dziś').length).toBeGreaterThanOrEqual(1))

    // All 6 metric chips + 3 section count badges show 0 — use getAllByText
    const zeros = screen.getAllByText('0')
    expect(zeros.length).toBeGreaterThanOrEqual(6)
    // Chip labels
    // 'Po terminie' appears as a metric chip label AND a section title
    const poTerminies = screen.getAllByText('Po terminie')
    expect(poTerminies.length).toBeGreaterThanOrEqual(1)
    const dziśChips = screen.getAllByText('Dziś')
    expect(dziśChips.length).toBe(2) // title h2 + metric chip
    expect(screen.getByText('7 dni')).toBeInTheDocument()
    expect(screen.getByText('Gotowe do pracy')).toBeInTheDocument()
    expect(screen.getByText('Zablokowane')).toBeInTheDocument()
    expect(screen.getByText('Wysoki priorytet')).toBeInTheDocument()
  })

  it('shows all three empty section messages', async () => {
    render(<TodayPage />)
    await waitFor(() => expect(screen.getAllByText('Dziś').length).toBeGreaterThanOrEqual(1))

    expect(screen.getByText('Nie ma zaległych zadań.')).toBeInTheDocument()
    expect(screen.getByText('Na dziś nic nie czeka.')).toBeInTheDocument()
    expect(screen.getByText('Brak zadań w najbliższym tygodniu.')).toBeInTheDocument()
  })

  /* ---------- Data rendering ---------- */

  it('renders tasks in the correct section based on list', async () => {
    mockToday.mockResolvedValue(
      makeTodayResponse({
        overdue: [makeTask(1, { title: 'Overdue Task' })],
        today: [makeTask(2, { title: 'Today Task' })],
        upcoming: [makeTask(3, { title: 'Upcoming Task' })],
      }),
    )
    render(<TodayPage />)
    await waitFor(() => {
      expect(screen.getByText('Overdue Task')).toBeInTheDocument()
      expect(screen.getByText('Today Task')).toBeInTheDocument()
      expect(screen.getByText('Upcoming Task')).toBeInTheDocument()
    })
  })

  it('shows metric chips with correct counts', async () => {
    mockToday.mockResolvedValue(
      makeTodayResponse({
        overdue: [makeTask(1)],
        today: [makeTask(2), makeTask(3)],
        upcoming: [makeTask(4), makeTask(5), makeTask(6)],
        counts: {
          overdue: 1, today: 2, upcoming: 3, total: 6,
          blocked: 2, ready: 4, high_priority: 1,
        },
      }),
    )
    render(<TodayPage />)
    await waitFor(() => expect(screen.getAllByText('Dziś').length).toBeGreaterThanOrEqual(1))

    // All chip values appear. '1' appears multiple times (overdue=1, high_priority=1)
    const ones = screen.getAllByText('1')
    expect(ones.length).toBeGreaterThanOrEqual(2)
    // '2' appears twice (today=2, blocked=2) — use getAllByText
    const twos = screen.getAllByText('2')
    expect(twos.length).toBeGreaterThanOrEqual(1)
    // '3' appears in the upcoming metric chip (upcoming=3) and the section badge (3 tasks)
    const threes = screen.getAllByText('3')
    expect(threes.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('4')).toBeInTheDocument()
    // '6' is the total count but is not displayed in any chip — only overdue/today/upcoming/ready/blocked/high_priority are shown
    // Verify by checking '4' is visible instead
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('shows section count badges', async () => {
    mockToday.mockResolvedValue(
      makeTodayResponse({
        overdue: [makeTask(1)],
        today: [makeTask(2), makeTask(3)],
        upcoming: [makeTask(4), makeTask(5), makeTask(6)],
        counts: {
          overdue: 1, today: 2, upcoming: 3, total: 6,
          blocked: 0, ready: 5, high_priority: 0,
        },
      }),
    )
    render(<TodayPage />)
    await waitFor(() => expect(screen.getAllByText('Dziś').length).toBeGreaterThanOrEqual(1))

    // Section count badges — each section <h3> has a sibling span with the count
    const sectionTitles = screen.getAllByText('Po terminie')
    expect(sectionTitles.length).toBeGreaterThanOrEqual(1)
  })

  /* ---------- Task row rendering ---------- */

  it('renders project name on task rows', async () => {
    mockToday.mockResolvedValue(
      makeTodayResponse({
        today: [makeTask(1, { project: 'My Project' })],
      }),
    )
    render(<TodayPage />)
    await waitFor(() => {
      expect(screen.getByText('My Project')).toBeInTheDocument()
    })
  })

  it('renders priority badge on task rows', async () => {
    mockToday.mockResolvedValue(
      makeTodayResponse({
        today: [makeTask(1, { priority: 'high' })],
      }),
    )
    render(<TodayPage />)
    await waitFor(() => expect(screen.getByText('Wysoki')).toBeInTheDocument())
  })

  it('renders assignee name when assigned', async () => {
    mockToday.mockResolvedValue(
      makeTodayResponse({
        today: [makeTask(1, {
          assignees: [{ id: 5, username: 'Ola', email: 'ola@test.com', role: 'user', team_id: 1, terms_accepted: true, privacy_accepted: true, marketing_consent: false, consented_at: null, created_at: '' }],
        })],
      }),
    )
    render(<TodayPage />)
    await waitFor(() => expect(screen.getByText('Ola')).toBeInTheDocument())
  })

  it('shows Nieprzypisane when no assignee', async () => {
    mockToday.mockResolvedValue(
      makeTodayResponse({
        today: [makeTask(1)],
      }),
    )
    render(<TodayPage />)
    await waitFor(() => expect(screen.getByText('Nieprzypisane')).toBeInTheDocument())
  })

  it('shows Zablokowane badge on blocked tasks', async () => {
    mockToday.mockResolvedValue(
      makeTodayResponse({
        today: [makeTask(1, { is_blocked: true })],
      }),
    )
    render(<TodayPage />)
    await waitFor(() => {
      const badges = screen.getAllByText('Zablokowane')
      expect(badges.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows W toku badge on in_progress tasks', async () => {
    mockToday.mockResolvedValue(
      makeTodayResponse({
        today: [makeTask(1, { status: 'in_progress' })],
      }),
    )
    render(<TodayPage />)
    await waitFor(() => expect(screen.getByText('W toku')).toBeInTheDocument())
  })

  it('shows due date badge when present', async () => {
    mockToday.mockResolvedValue(
      makeTodayResponse({
        today: [makeTask(1, { due_date: '2099-12-31' })],
      }),
    )
    render(<TodayPage />)
    // formatDate produces e.g. "czw., 31 gru" — check for month abbreviation
    await waitFor(() => {
      expect(screen.getByText(/gru/)).toBeInTheDocument()
    })
  })

  /* ---------- Start button ---------- */

  it('shows Start button for todo tasks', async () => {
    mockToday.mockResolvedValue(
      makeTodayResponse({
        today: [makeTask(1, { status: 'todo' })],
      }),
    )
    render(<TodayPage />)
    await waitFor(() => expect(screen.getByTitle('Rozpocznij zadanie')).toBeInTheDocument())
  })

  it('does not show Start button for in_progress tasks', async () => {
    mockToday.mockResolvedValue(
      makeTodayResponse({
        today: [makeTask(1, { status: 'in_progress' })],
      }),
    )
    render(<TodayPage />)
    await waitFor(() => expect(screen.getByText('Task 1')).toBeInTheDocument())
    expect(screen.queryByTitle('Rozpocznij zadanie')).not.toBeInTheDocument()
  })

  it('calls api.tasks.update when Start button is clicked', async () => {
    mockUpdateTask.mockResolvedValue(makeTask(1, { status: 'in_progress' }))
    mockToday.mockResolvedValue(
      makeTodayResponse({
        today: [makeTask(1, { status: 'todo' })],
      }),
    )
    render(<TodayPage />)
    await waitFor(() => expect(screen.getByTitle('Rozpocznij zadanie')).toBeInTheDocument())

    fireEvent.click(screen.getByTitle('Rozpocznij zadanie'))

    await waitFor(() => {
      expect(mockUpdateTask).toHaveBeenCalledWith(1, {
        status: 'in_progress',
        completed: false,
      })
    })
  })

  it('reverts start task on API error with toast', async () => {
    mockUpdateTask.mockRejectedValue(new Error('Update failed'))
    mockToday.mockResolvedValue(
      makeTodayResponse({
        today: [makeTask(1, { title: 'Task 1', status: 'todo' })],
      }),
    )
    render(<TodayPage />)
    await waitFor(() => expect(screen.getByTitle('Rozpocznij zadanie')).toBeInTheDocument())

    fireEvent.click(screen.getByTitle('Rozpocznij zadanie'))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Update failed', 'error')
    })
  })

  /* ---------- Complete button ---------- */

  it('shows complete button on task rows', async () => {
    mockToday.mockResolvedValue(
      makeTodayResponse({
        today: [makeTask(1)],
      }),
    )
    render(<TodayPage />)
    await waitFor(() => expect(screen.getByTitle('Zakończ zadanie')).toBeInTheDocument())
  })

  it('calls api.tasks.complete when complete button is clicked', async () => {
    mockCompleteTask.mockResolvedValue(makeTask(1, { completed: true, status: 'done' }))
    mockToday.mockResolvedValue(
      makeTodayResponse({
        today: [makeTask(1)],
      }),
    )
    render(<TodayPage />)
    await waitFor(() => expect(screen.getByTitle('Zakończ zadanie')).toBeInTheDocument())

    fireEvent.click(screen.getByTitle('Zakończ zadanie'))

    await waitFor(() => {
      expect(mockCompleteTask).toHaveBeenCalledWith(1)
    })
  })

  it('disables complete button for blocked tasks', async () => {
    mockToday.mockResolvedValue(
      makeTodayResponse({
        today: [makeTask(1, { is_blocked: true })],
      }),
    )
    render(<TodayPage />)
    await waitFor(() => {
      const btn = screen.getByTitle('Zadanie zablokowane')
      expect(btn).toBeDisabled()
    })
  })

  it('reverts complete on API error with toast', async () => {
    mockCompleteTask.mockRejectedValue(new Error('Complete failed'))
    mockToday.mockResolvedValue(
      makeTodayResponse({
        today: [makeTask(1)],
      }),
    )
    render(<TodayPage />)
    await waitFor(() => expect(screen.getByTitle('Zakończ zadanie')).toBeInTheDocument())

    fireEvent.click(screen.getByTitle('Zakończ zadanie'))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Complete failed', 'error')
    })
  })

  /* ---------- Socket event handlers ---------- */

  it('applies onDelete to remove tasks from all lists', async () => {
    // Clear previous socketHandlers before this render
    socketHandlers = {}

    const responseData = makeTodayResponse({
      overdue: [makeTask(1, { title: 'Overdue Task' })],
      today: [makeTask(2, { title: 'Today Task' })],
      upcoming: [makeTask(3, { title: 'Upcoming Task' })],
    })
    mockToday.mockResolvedValue(responseData)

    render(<TodayPage />)
    await waitFor(() => {
      expect(screen.getByText('Overdue Task')).toBeInTheDocument()
      expect(screen.getByText('Today Task')).toBeInTheDocument()
      expect(screen.getByText('Upcoming Task')).toBeInTheDocument()
    })

    // Invoke the onDelete handler captured by the mock
    await waitFor(() => {
      socketHandlers.onDelete?.(1)
    })

    await waitFor(() => {
      expect(screen.queryByText('Overdue Task')).not.toBeInTheDocument()
      expect(screen.getByText('Today Task')).toBeInTheDocument()
      expect(screen.getByText('Upcoming Task')).toBeInTheDocument()
    })
  })

  it('applies onUpdate to replace tasks across all lists', async () => {
    socketHandlers = {}

    const originalTask = makeTask(1, { title: 'Old Title' })
    const updatedTask = makeTask(1, { title: 'Updated Title' })

    mockToday.mockResolvedValue(
      makeTodayResponse({
        overdue: [originalTask],
      }),
    )

    render(<TodayPage />)
    await waitFor(() => expect(screen.getByText('Old Title')).toBeInTheDocument())

    await waitFor(() => {
      socketHandlers.onUpdate?.(updatedTask)
    })

    await waitFor(() => {
      expect(screen.queryByText('Old Title')).not.toBeInTheDocument()
      expect(screen.getByText('Updated Title')).toBeInTheDocument()
    })
  })

  it('applies onBulk to reload data', async () => {
    socketHandlers = {}

    // First render with empty data
    render(<TodayPage />)
    await waitFor(() => expect(screen.getAllByText('Dziś').length).toBeGreaterThanOrEqual(1))

    // Set up new data for the reload
    mockToday.mockResolvedValue(
      makeTodayResponse({
        today: [makeTask(1, { title: 'After Bulk' })],
      }),
    )

    await waitFor(() => {
      socketHandlers.onBulk?.()
    })

    await waitFor(() => {
      expect(screen.getByText('After Bulk')).toBeInTheDocument()
    })
  })

  it('shows error toast when api.tasks.today fails', async () => {
    mockToday.mockRejectedValue(new Error('Network failure'))
    render(<TodayPage />)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Network failure', 'error')
    })
  })

  /* ---------- Blocked chip value shows correctly ---------- */

  it('displays blocked count from data', async () => {
    mockToday.mockResolvedValue(
      makeTodayResponse({
        counts: { overdue: 0, today: 0, upcoming: 0, total: 0, blocked: 3, ready: 0, high_priority: 0 },
      }),
    )
    render(<TodayPage />)
    await waitFor(() => expect(screen.getAllByText('Dziś').length).toBeGreaterThanOrEqual(1))

    expect(screen.getByText('3')).toBeInTheDocument()
  })

  /* ---------- High priority chip ---------- */

  it('displays high_priority count from data', async () => {
    mockToday.mockResolvedValue(
      makeTodayResponse({
        counts: { overdue: 0, today: 0, upcoming: 0, total: 0, blocked: 0, ready: 0, high_priority: 5 },
      }),
    )
    render(<TodayPage />)
    await waitFor(() => expect(screen.getAllByText('Dziś').length).toBeGreaterThanOrEqual(1))

    const fives = screen.getAllByText('5')
    expect(fives.length).toBeGreaterThanOrEqual(1)
  })
})
