import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectForm from './ProjectForm'

const mockAddToast = vi.fn()
const mockCreateProject = vi.fn().mockResolvedValue({ id: 42, name: 'New Project', description: '', color: '#3b82f6', archived: false, members: [], created_by_id: 1, created_at: null })
const mockOnProjectCreated = vi.fn()

vi.mock('@/store/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}))

vi.mock('@/api/client', () => ({
  api: {
    projects: {
      create: (...args: unknown[]) => mockCreateProject(...args),
    },
  },
}))

const users = [
  { id: 1, username: 'Jan', email: 'jan@test.com', role: 'user' as const, team_id: 1, terms_accepted: true, privacy_accepted: true, marketing_consent: false, consented_at: null, created_at: '' },
  { id: 2, username: 'Anna', email: 'anna@test.com', role: 'user' as const, team_id: 1, terms_accepted: true, privacy_accepted: true, marketing_consent: false, consented_at: null, created_at: '' },
]

describe('ProjectForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the form title', () => {
    render(<ProjectForm allUsers={users} onProjectCreated={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Nowy projekt')).toBeInTheDocument()
  })

  it('renders form fields', () => {
    render(<ProjectForm allUsers={users} onProjectCreated={vi.fn()} onCancel={vi.fn()} />)
    // Labels and inputs are not associated via htmlFor, so check text content separately
    expect(screen.getByText('Nazwa projektu *')).toBeInTheDocument()
    expect(screen.getByText('Opis')).toBeInTheDocument()
    const colorDisplay = screen.getAllByDisplayValue('#3b82f6')
    expect(colorDisplay.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Członkowie projektu')).toBeInTheDocument()
    // Verify textboxes exist on the page
    expect(screen.getAllByRole('textbox').length).toBeGreaterThanOrEqual(2)
  })

  it('renders user checkboxes', () => {
    render(<ProjectForm allUsers={users} onProjectCreated={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Jan')).toBeInTheDocument()
    expect(screen.getByText('Anna')).toBeInTheDocument()
  })

  it('shows empty state when no users', () => {
    render(<ProjectForm allUsers={[]} onProjectCreated={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Brak użytkowników do przypisania.')).toBeInTheDocument()
  })

  it('shows cancel and submit buttons', () => {
    render(<ProjectForm allUsers={users} onProjectCreated={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Anuluj')).toBeInTheDocument()
    expect(screen.getByText('Utwórz projekt')).toBeInTheDocument()
  })

  it('calls onCancel when cancel button clicked', () => {
    const onCancel = vi.fn()
    render(<ProjectForm allUsers={users} onProjectCreated={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('Anuluj'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('calls API and onProjectCreated on submit', async () => {
    const user = userEvent.setup()
    render(<ProjectForm allUsers={users} onProjectCreated={mockOnProjectCreated} onCancel={vi.fn()} />)

    const nameInput = screen.getAllByRole('textbox')[0]
    await user.type(nameInput, 'New Project')

    await user.click(screen.getByText('Utwórz projekt'))

    expect(mockCreateProject).toHaveBeenCalledWith({
      name: 'New Project',
      description: '',
      color: '#3b82f6',
      member_ids: [],
    })
    expect(mockOnProjectCreated).toHaveBeenCalledWith(42)
  })

  it('does not submit with empty name', async () => {
    const user = userEvent.setup()
    render(<ProjectForm allUsers={users} onProjectCreated={mockOnProjectCreated} onCancel={vi.fn()} />)

    await user.click(screen.getByText('Utwórz projekt'))

    expect(mockCreateProject).not.toHaveBeenCalled()
  })

  it('submits with selected members', async () => {
    const user = userEvent.setup()
    render(<ProjectForm allUsers={users} onProjectCreated={mockOnProjectCreated} onCancel={vi.fn()} />)

    const nameInput = screen.getAllByRole('textbox')[0]
    await user.type(nameInput, 'Team Project')

    // Toggle Jan checkbox
    const janCheckbox = screen.getByText('Jan').previousElementSibling as HTMLInputElement
    await user.click(janCheckbox)

    await user.click(screen.getByText('Utwórz projekt'))

    expect(mockCreateProject).toHaveBeenCalledWith({
      name: 'Team Project',
      description: '',
      color: '#3b82f6',
      member_ids: [1],
    })
  })
})
