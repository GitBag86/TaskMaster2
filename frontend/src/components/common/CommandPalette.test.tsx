import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandPalette } from './CommandPalette'

// Mock react-router-dom
const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

// Mock stores
const mockToggle = vi.fn()
const mockAddToast = vi.fn()

vi.mock('@/store/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      role: 'manager',
      team_id: 1,
      terms_accepted: true,
      privacy_accepted: true,
      marketing_consent: false,
      consented_at: null,
      created_at: '2024-01-01T00:00:00Z',
    },
    currentTeam: { id: 1, name: 'Test Team', slug: 'test-team' },
    loading: false,
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('@/store/ThemeContext', () => ({
  useTheme: () => ({
    toggle: mockToggle,
    dark: false,
  }),
}))

vi.mock('@/store/ToastContext', () => ({
  useToast: () => ({
    addToast: mockAddToast,
  }),
}))

// Mock API
vi.mock('@/api/client', () => ({
  api: {
    tasks: {
      search: vi.fn().mockResolvedValue({ tasks: [] }),
      quickAdd: vi.fn().mockResolvedValue({ task: { id: 2, title: 'Quick task' } }),
    },
  },
}))

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when closed', () => {
    const { container } = render(<CommandPalette />)
    expect(container.innerHTML).toBe('')
  })

  it('opens on Ctrl+K and shows search input', () => {
    render(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(
      screen.getByPlaceholderText(/Szukaj albo wpisz/),
    ).toBeInTheDocument()
  })

  it('shows navigation commands by default', () => {
    render(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    expect(screen.getByText('Zadania')).toBeInTheDocument()
    expect(screen.getByText('Dziś')).toBeInTheDocument()
    expect(screen.getByText('Projekty')).toBeInTheDocument()
    expect(screen.getByText('Kalendarz')).toBeInTheDocument()
    expect(screen.getByText('Kanban')).toBeInTheDocument()
    expect(screen.getByText('Statystyki')).toBeInTheDocument()
    expect(screen.getByText('Aktywność')).toBeInTheDocument()
  })

  it('shows manager-specific commands for manager role', () => {
    render(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    expect(screen.getByText('Członkowie zespołu')).toBeInTheDocument()
    expect(screen.getByText('Zaproszenia')).toBeInTheDocument()
  })

  it('navigates when a command is clicked', () => {
    render(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    const tasksButton = screen.getByText('Zadania').closest('button')
    expect(tasksButton).not.toBeNull()
    tasksButton!.click()

    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('toggles theme when theme command is clicked', () => {
    render(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    const themeButton = screen.getByText('Przełącz motyw').closest('button')
    expect(themeButton).not.toBeNull()
    themeButton!.click()

    expect(mockToggle).toHaveBeenCalled()
  })

  it('filters commands based on query', async () => {
    const user = userEvent.setup()
    render(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    const input = screen.getByPlaceholderText(/Szukaj albo wpisz/)
    await user.type(input, 'kal')

    expect(screen.getByText('Kalendarz')).toBeInTheDocument()
    // Other commands should be filtered out
    expect(screen.queryByText('Zadania')).not.toBeInTheDocument()
  })

  it('closes on Escape', () => {
    render(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(
      screen.getByPlaceholderText(/Szukaj albo wpisz/),
    ).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(
      screen.queryByPlaceholderText(/Szukaj albo wpisz/),
    ).not.toBeInTheDocument()
  })

  it('shows quick add section when query starts with +', async () => {
    const user = userEvent.setup()
    render(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    const input = screen.getByPlaceholderText(/Szukaj albo wpisz/)
    await user.type(input, '+Nowe zadanie')

    expect(screen.getByText('Szybkie dodawanie')).toBeInTheDocument()
    expect(screen.getByText('Nowe zadanie')).toBeInTheDocument()
  })

  it('shows empty state when no results and no quick add', async () => {
    const user = userEvent.setup()
    render(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    const input = screen.getByPlaceholderText(/Szukaj albo wpisz/)
    await user.type(input, 'zzzzzzzxxxxx')

    expect(screen.getByText(/Brak wyników/)).toBeInTheDocument()
  })

  it('closes the palette when clicking the backdrop', () => {
    render(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(
      screen.getByPlaceholderText(/Szukaj albo wpisz/),
    ).toBeInTheDocument()

    // The backdrop is the outermost div with fixed+inset-0 classes
    const backdrop = document.querySelector('.fixed.inset-0')
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop!)

    expect(
      screen.queryByPlaceholderText(/Szukaj albo wpisz/),
    ).not.toBeInTheDocument()
  })
})
