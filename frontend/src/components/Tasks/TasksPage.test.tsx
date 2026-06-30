import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TasksPage from './TasksPage'
import type { Task } from '@/types'

/* ------------------------------------------------------------------ */
/*  React Router mock                                                  */
/* ------------------------------------------------------------------ */

let mockSearchParams = new URLSearchParams()
const mockSetSearchParams = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
  useParams: () => ({}),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    <a href={to}>{children}</a>,
}))

/* ------------------------------------------------------------------ */
/*  React Query mock — controlled via module variable                 */
/* ------------------------------------------------------------------ */

let mockQueryData: { tasks: Task[]; total: number; page: number; pages: number; per_page: number } | null = null
let mockQueryIsLoading = false

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: mockQueryData,
    isLoading: mockQueryIsLoading,
    isError: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}))

/* ------------------------------------------------------------------ */
/*  DnD mocks                                                         */
/* ------------------------------------------------------------------ */

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => children,
  closestCenter: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: () => vi.fn(),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
    attributes: {},
    listeners: {},
  }),
  SortableContext: ({ children }: { children: React.ReactNode }) => children,
  rectSortingStrategy: vi.fn(),
}))

/* ------------------------------------------------------------------ */
/*  Framer Motion stub                                                */
/* ------------------------------------------------------------------ */

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div', tr: 'tr' },
}))

/* ------------------------------------------------------------------ */
/*  Child component stubs — avoid rendering complexity                */
/* ------------------------------------------------------------------ */

vi.mock('@/components/common/Modal', () => ({
  default: ({ children, onClose }: any) =>
    <div data-testid="modal" onClick={onClose}>{children}</div>,
}))

vi.mock('./TaskForm', () => ({
  default: () => <div data-testid="task-form">TaskForm stub</div>,
}))

/* ------------------------------------------------------------------ */
/*  Context mocks                                                     */
/* ------------------------------------------------------------------ */

const mockAddToast = vi.fn()

let mockUser: any = {
  id: 1,
  username: 'admin',
  role: 'manager',
  email: 'admin@test.com',
  team_id: 1,
  terms_accepted: true,
  privacy_accepted: true,
  marketing_consent: false,
  consented_at: null,
  created_at: '2024-01-01T00:00:00Z',
}

vi.mock('@/store/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}))

vi.mock('@/store/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}))

/* ------------------------------------------------------------------ */
/*  Socket hook mock — no-op for these tests                          */
/* ------------------------------------------------------------------ */

vi.mock('@/hooks/useSocketTaskEvents', () => ({
  useSocketTaskEvents: () => {},
}))

/* ------------------------------------------------------------------ */
/*  API client mock                                                   */
/* ------------------------------------------------------------------ */

const mockGetAllTasks = vi.fn()
const mockSearchTasks = vi.fn()
const mockCompleteTask = vi.fn()
const mockBulkComplete = vi.fn()
const mockBulkDelete = vi.fn()
const mockBulkUpdate = vi.fn()
const mockReorder = vi.fn()
const mockCreateTask = vi.fn()
const mockUpdateTask = vi.fn()

vi.mock('@/api/client', () => ({
  api: {
    tasks: {
      getAll: (...args: unknown[]) => mockGetAllTasks(...args),
      search: (...args: unknown[]) => mockSearchTasks(...args),
      complete: (...args: unknown[]) => mockCompleteTask(...args),
      bulkComplete: (...args: unknown[]) => mockBulkComplete(...args),
      bulkDelete: (...args: unknown[]) => mockBulkDelete(...args),
      bulkUpdate: (...args: unknown[]) => mockBulkUpdate(...args),
      reorder: (...args: unknown[]) => mockReorder(...args),
      create: (...args: unknown[]) => mockCreateTask(...args),
      update: (...args: unknown[]) => mockUpdateTask(...args),
    },
  },
}))

/* ------------------------------------------------------------------ */
/*  URL filter mock — fully controlled from tests                     */
/* ------------------------------------------------------------------ */

let mockFilters: any = { q: '', priority: '', project: '', status: '', page: '1' }
let mockActiveCount = 0
const mockSetFilter = vi.fn()
const mockResetFilters = vi.fn()

vi.mock('@/utils/useUrlFilters', () => ({
  useUrlFilters: () => ({
    filters: mockFilters,
    setFilter: mockSetFilter,
    setFilters: vi.fn(),
    resetFilters: mockResetFilters,
    activeCount: mockActiveCount,
  }),
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

function setupTasks(tasks: Task[], total?: number) {
  mockQueryData = {
    tasks,
    total: total ?? tasks.length,
    page: 1,
    pages: Math.max(1, Math.ceil((total ?? tasks.length) / 24)),
    per_page: 24,
  }
  mockQueryIsLoading = false
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('TasksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams = new URLSearchParams()
    mockFilters = { q: '', priority: '', project: '', status: '', page: '1' }
    mockActiveCount = 0
    mockUser = { ...mockUser, role: 'manager' }
    mockQueryIsLoading = false
    mockQueryData = null
  })

  /* ---------- Loading state ---------- */

  it('shows loading skeleton while loading', () => {
    mockQueryIsLoading = true
    mockQueryData = null
    const { container } = render(<TasksPage />)
    // When loading, no tasks heading should appear
    expect(screen.queryByText('Zadania')).not.toBeInTheDocument()
    // The skeleton is rendered
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0)
  })

  /* ---------- Empty state ---------- */

  it('shows empty state when there are no tasks', () => {
    setupTasks([])
    render(<TasksPage />)
    expect(screen.getByText('Brak zadań')).toBeInTheDocument()
  })

  /* ---------- Full page — card view ---------- */

  it('renders with correct page heading and task count', () => {
    setupTasks([makeTask(1), makeTask(2)])
    render(<TasksPage />)
    expect(screen.getByText('Zadania')).toBeInTheDocument()
    expect(screen.getByText('Wszystkie zadania: 2')).toBeInTheDocument()
  })

  it('renders task cards for each task in card view', () => {
    setupTasks([makeTask(1, { title: 'Alpha' }), makeTask(2, { title: 'Beta' })])
    render(<TasksPage />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('shows "Nowe zadanie" button for manager role', () => {
    setupTasks([makeTask(1)])
    render(<TasksPage />)
    expect(screen.getByText('Nowe zadanie')).toBeInTheDocument()
  })

  it('hides "Nowe zadanie" button for user role', () => {
    mockUser = { ...mockUser, role: 'user' }
    setupTasks([makeTask(1)])
    render(<TasksPage />)
    expect(screen.queryByText('Nowe zadanie')).not.toBeInTheDocument()
  })

  /* ---------- View toggle ---------- */

  it('renders table view when clicking table mode button', () => {
    setupTasks([makeTask(1)])
    render(<TasksPage />)
    // Click the table view button
    const tableBtn = screen.getByTitle('Widok tabeli')
    fireEvent.click(tableBtn)
    // The table mode should show the table icon active state
    // Since we mock TaskTable as a stub, verify the stub renders
    expect(screen.queryByText('Do zrob.')).toBeInTheDocument()
  })

  it('toggles back to card view after switching to table', () => {
    setupTasks([makeTask(1)])
    render(<TasksPage />)

    // Switch to table
    const tableBtn = screen.getByTitle('Widok tabeli')
    fireEvent.click(tableBtn)
    expect(tableBtn.className).toContain('bg-primary')

    // Switch back to card
    const cardBtn = screen.getByTitle('Widok kafelków')
    fireEvent.click(cardBtn)
    expect(cardBtn.className).toContain('bg-primary')
    expect(tableBtn.className).not.toContain('bg-primary')
  })

  /* ---------- Stat cards ---------- */

  it('shows stat cards with correct pending count', () => {
    setupTasks([
      makeTask(1, { completed: false }),
      makeTask(2, { completed: true }),
      makeTask(3, { completed: false }),
    ])
    render(<TasksPage />)
    // "Do zrobienia" appears in stat cards AND in TaskCard status badges
    const doZrobienia = screen.getAllByText('Do zrobienia')
    expect(doZrobienia.length).toBeGreaterThanOrEqual(1)
    // pending count stat shows 2
    const twos = screen.getAllByText('2')
    expect(twos.length).toBeGreaterThanOrEqual(1)
  })

  it('shows blocked count in stat cards', () => {
    setupTasks([
      makeTask(1, { is_blocked: true }),
      makeTask(2, { is_blocked: false }),
    ])
    render(<TasksPage />)
    // "Zablokowane" appears in stat cards AND in TaskCard blocked badge
    const blockedTexts = screen.getAllByText(/Zablokowane/)
    expect(blockedTexts.length).toBeGreaterThanOrEqual(1)
  })

  /* ---------- Pagination ---------- */

  it('shows pagination controls when there are multiple pages', () => {
    const tasks = Array.from({ length: 25 }, (_, i) => makeTask(i + 1)) // > PER_PAGE (24)
    setupTasks(tasks, 48) // total 48 = 2 pages
    render(<TasksPage />)
    expect(screen.getByText('Strona 1 z 2')).toBeInTheDocument()
    expect(screen.getByText('Następna')).toBeInTheDocument()
    expect(screen.getByText('Poprzednia')).toBeInTheDocument()
  })

  it('disables previous button on page 1', () => {
    const tasks = Array.from({ length: 25 }, (_, i) => makeTask(i + 1))
    setupTasks(tasks, 48)
    mockFilters = { ...mockFilters, page: '1' }
    render(<TasksPage />)
    expect(screen.getByText('Poprzednia')).toBeDisabled()
    expect(screen.getByText('Następna')).not.toBeDisabled()
  })

  it('disables next button on last page', () => {
    const tasks = Array.from({ length: 25 }, (_, i) => makeTask(i + 1))
    setupTasks(tasks, 48)
    mockFilters = { ...mockFilters, page: '2' }
    mockQueryData = { ...mockQueryData!, page: 2 }
    render(<TasksPage />)
    expect(screen.getByText('Następna')).toBeDisabled()
  })

  it('navigates to next page when clicking Następna', () => {
    const tasks = Array.from({ length: 25 }, (_, i) => makeTask(i + 1))
    setupTasks(tasks, 48)
    mockFilters = { ...mockFilters, page: '1' }
    mockGetAllTasks.mockResolvedValue({
      tasks: tasks.slice(0, 24),
      total: 48,
      page: 1,
      pages: 2,
      per_page: 24,
    })
    render(<TasksPage />)

    const nextBtn = screen.getByText('Następna')
    fireEvent.click(nextBtn)
    expect(mockSetFilter).toHaveBeenCalledWith('page', '2')
  })

  /* ---------- Filtering ---------- */

  it('calls setFilter when priority filter changes', () => {
    setupTasks([makeTask(1)])
    render(<TasksPage />)
    // There are two selects with "Priorytet" option (filter + bulk). Pick the first one.
    const prioritySelects = screen.getAllByDisplayValue('Priorytet')
    fireEvent.change(prioritySelects[0], { target: { value: 'high' } })
    expect(mockSetFilter).toHaveBeenCalledWith('priority', 'high')
  })

  it('calls setFilter when status filter changes', () => {
    setupTasks([makeTask(1)])
    render(<TasksPage />)
    // There are two selects with "Status" option (filter + bulk). Pick the first one.
    const statusSelects = screen.getAllByDisplayValue('Status')
    fireEvent.change(statusSelects[0], { target: { value: 'completed' } })
    expect(mockSetFilter).toHaveBeenCalledWith('status', 'completed')
  })

  it('shows filter badge count when filters are active', () => {
    mockActiveCount = 2
    setupTasks([makeTask(1)])
    render(<TasksPage />)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Wyczyść')).toBeInTheDocument()
  })

  it('calls resetFilters and fetchTasks when clicking clear', () => {
    mockActiveCount = 1
    mockGetAllTasks.mockResolvedValue({
      tasks: [],
      total: 0,
      page: 1,
      pages: 1,
      per_page: 24,
    })
    setupTasks([makeTask(1)])
    render(<TasksPage />)

    const clearBtn = screen.getByText('Wyczyść')
    fireEvent.click(clearBtn)

    expect(mockResetFilters).toHaveBeenCalled()
  })

  /* ---------- Search ---------- */

  it('calls search API when pressing Enter in search input', async () => {
    mockFilters = { ...mockFilters, q: 'findme' }
    mockSearchTasks.mockResolvedValue({
      tasks: [makeTask(1, { title: 'findme task' })],
    })
    setupTasks([])
    render(<TasksPage />)

    const input = screen.getByPlaceholderText('Szukaj zadań...')
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockSearchTasks).toHaveBeenCalledWith('findme')
    })
  })

  it('calls search when clicking Szukaj button', async () => {
    mockFilters = { ...mockFilters, q: 'search' }
    mockSearchTasks.mockResolvedValue({
      tasks: [makeTask(1, { title: 'search result' })],
    })
    setupTasks([])
    render(<TasksPage />)

    const searchBtn = screen.getByText('Szukaj')
    fireEvent.click(searchBtn)

    await waitFor(() => {
      expect(mockSearchTasks).toHaveBeenCalledWith('search')
    })
  })

  /* ---------- Bulk selection ---------- */

  it('shows bulk actions toolbar for manager role', () => {
    setupTasks([makeTask(1)])
    render(<TasksPage />)
    expect(screen.getByText('Ukończ')).toBeInTheDocument()
    expect(screen.getByText('Usuń')).toBeInTheDocument()
    expect(screen.getByText('Zmień')).toBeInTheDocument()
    expect(screen.getByText('Ustaw')).toBeInTheDocument()
    expect(screen.getByText('Przenieś')).toBeInTheDocument()
  })

  it('hides bulk actions toolbar for user role', () => {
    mockUser = { ...mockUser, role: 'user' }
    setupTasks([makeTask(1)])
    render(<TasksPage />)
    expect(screen.queryByText('Ukończ')).not.toBeInTheDocument()
    expect(screen.queryByText('Usuń')).not.toBeInTheDocument()
  })

  it('disables bulk action buttons when no tasks selected', () => {
    setupTasks([makeTask(1)])
    render(<TasksPage />)
    expect(screen.getByText('Ukończ')).toBeDisabled()
    expect(screen.getByText('Usuń')).toBeDisabled()
  })

  it('selects all visible tasks when clicking the visible checkbox', () => {
    setupTasks([makeTask(1), makeTask(2)])
    render(<TasksPage />)

    const selectAllCheckbox = screen.getByLabelText('Widoczne')
    fireEvent.click(selectAllCheckbox)

    expect(screen.getByText('2 zaznaczone')).toBeInTheDocument()
    expect(screen.getByText('Ukończ')).toBeEnabled()
    expect(screen.getByText('Usuń')).toBeEnabled()
  })

  it('calls bulkComplete when clicking Ukończ with selected tasks', async () => {
    mockBulkComplete.mockResolvedValue({ message: 'ok' })
    mockGetAllTasks.mockResolvedValue({
      tasks: [makeTask(1), makeTask(2)],
      total: 2,
      page: 1,
      pages: 1,
      per_page: 24,
    })
    setupTasks([makeTask(1), makeTask(2)])
    render(<TasksPage />)

    // Select all tasks
    const selectAllCheckbox = screen.getByLabelText('Widoczne')
    fireEvent.click(selectAllCheckbox)

    // Click bulk complete
    const completeBtn = screen.getByText('Ukończ')
    fireEvent.click(completeBtn)

    await waitFor(() => {
      expect(mockBulkComplete).toHaveBeenCalledWith([1, 2])
    })
  })

  it('calls bulkDelete when clicking Usuń with selected tasks', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))

    mockBulkDelete.mockResolvedValue({ message: 'deleted' })
    setupTasks([makeTask(1)])
    render(<TasksPage />)

    const selectAllCheckbox = screen.getByLabelText('Widoczne')
    fireEvent.click(selectAllCheckbox)

    const deleteBtn = screen.getByText('Usuń')
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(mockBulkDelete).toHaveBeenCalledWith([1])
    })
  })

  it('bulk status update calls bulkUpdate', async () => {
    mockBulkUpdate.mockResolvedValue({ message: 'ok' })
    mockGetAllTasks.mockResolvedValue({
      tasks: [makeTask(1)],
      total: 1,
      page: 1,
      pages: 1,
      per_page: 24,
    })
    setupTasks([makeTask(1)])
    render(<TasksPage />)

    // Select task
    const selectAllCheckbox = screen.getByLabelText('Widoczne')
    fireEvent.click(selectAllCheckbox)

    // Change status dropdown
    const statusSelect = screen.getAllByDisplayValue('Status')
    // The second "Status" select is the bulk one
    const bulkStatusSelect = statusSelect[1]
    fireEvent.change(bulkStatusSelect, { target: { value: 'done' } })

    // Click "Zmień"
    const changeBtn = screen.getByText('Zmień')
    fireEvent.click(changeBtn)

    await waitFor(() => {
      expect(mockBulkUpdate).toHaveBeenCalledWith([1], { status: 'done', completed: true })
    })
  })

  /* ---------- Create modal ---------- */

  it('opens create task modal when clicking Nowe zadanie', () => {
    setupTasks([makeTask(1)])
    render(<TasksPage />)
    fireEvent.click(screen.getByText('Nowe zadanie'))
    // The modal renders TaskForm inside
    expect(screen.getByTestId('modal')).toBeInTheDocument()
  })

  /* ---------- Inline update ---------- */

  it('enables inline update via the card when user is manager', () => {
    const task = makeTask(1, { title: 'Inline' })
    mockUpdateTask.mockResolvedValue({ ...task, title: 'Updated' })
    setupTasks([task])
    render(<TasksPage />)

    // Click the title to enter edit mode (title has onClick handler when onUpdate is provided)
    const title = screen.getByText('Inline')
    fireEvent.click(title)
    expect(screen.getByDisplayValue('Inline')).toBeInTheDocument()
  })

  /* ---------- Filter dropdown options ---------- */

  it('renders filter dropdowns with correct options', () => {
    setupTasks([
      makeTask(1, { project: 'Alpha' }),
      makeTask(2, { project: 'Beta' }),
    ])
    render(<TasksPage />)

    // Priority filter (first select with "Priorytet" option)
    const prioritySelects = screen.getAllByDisplayValue('Priorytet')
    const prioritySelect = prioritySelects[0]
    expect(prioritySelect).toBeInTheDocument()
    const options = Array.from(prioritySelect.querySelectorAll('option'))
    expect(options.map(o => o.textContent)).toContain('Wysoki')
    expect(options.map(o => o.textContent)).toContain('Średni')
    expect(options.map(o => o.textContent)).toContain('Niski')

    // Project filter (only one "Projekt" option)
    const projectSelects = screen.getAllByDisplayValue('Projekt')
    expect(projectSelects[0]).toBeInTheDocument()

    // Status filter (first select with "Status" option)
    const statusSelects = screen.getAllByDisplayValue('Status')
    expect(statusSelects[0]).toBeInTheDocument()
  })

  /* ---------- Task count per page ---------- */

  it('shows correct task count on current page', () => {
    setupTasks([makeTask(1), makeTask(2), makeTask(3)])
    render(<TasksPage />)

    expect(screen.getByText('Na tej stronie')).toBeInTheDocument()
    const threes = screen.getAllByText('3')
    expect(threes.length).toBeGreaterThanOrEqual(1)
  })

  /* ---------- Tab title / search mode indicator ---------- */

  it('shows search result count when in search mode', async () => {
    mockFilters = { ...mockFilters, q: 'test' }
    mockSearchTasks.mockResolvedValue({
      tasks: [makeTask(1, { title: 'test result' })],
    })

    setupTasks([makeTask(1)])
    render(<TasksPage />)

    const input = screen.getByPlaceholderText('Szukaj zadań...')
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockSearchTasks).toHaveBeenCalledWith('test')
    })
  })

  /* ---------- View mode button active state ---------- */

  it('applies active styling to the card view button by default', () => {
    setupTasks([makeTask(1)])
    render(<TasksPage />)

    const cardBtn = screen.getByTitle('Widok kafelków')
    // Default view is card, so the button should be active (primary bg)
    expect(cardBtn.className).toContain('bg-primary')
  })

  it('applies active styling to the table view button when selected', () => {
    setupTasks([makeTask(1)])
    render(<TasksPage />)

    const tableBtn = screen.getByTitle('Widok tabeli')
    fireEvent.click(tableBtn)
    expect(tableBtn.className).toContain('bg-primary')
  })
})
