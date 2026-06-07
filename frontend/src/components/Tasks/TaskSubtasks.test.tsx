import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TaskSubtasks from './TaskSubtasks'
import type { Subtask } from '@/types'

const mockAddToast = vi.fn()
const mockAddSubtask = vi.fn().mockResolvedValue({ id: 3, task_id: 1, title: 'New sub', completed: false })
const mockCompleteSubtask = vi.fn().mockResolvedValue({ id: 2, task_id: 1, title: 'Sub 2', completed: true })
const mockDeleteSubtask = vi.fn().mockResolvedValue({ message: 'ok' })
const mockOnSubtaskChange = vi.fn()

vi.mock('@/store/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}))

vi.mock('@/api/client', () => ({
  api: {
    subtasks: {
      add: (...args: unknown[]) => mockAddSubtask(...args),
      complete: (...args: unknown[]) => mockCompleteSubtask(...args),
      delete: (...args: unknown[]) => mockDeleteSubtask(...args),
    },
  },
}))

const subtasks: Subtask[] = [
  { id: 1, task_id: 1, title: 'Subtask 1', completed: false },
  { id: 2, task_id: 1, title: 'Subtask 2', completed: true },
]

describe('TaskSubtasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the section title', () => {
    render(<TaskSubtasks taskId={1} subtasks={[]} isAdmin={false} onSubtaskChange={vi.fn()} />)
    expect(screen.getByText('Podzadania')).toBeInTheDocument()
  })

  it('shows progress counter', () => {
    render(<TaskSubtasks taskId={1} subtasks={subtasks} isAdmin={false} onSubtaskChange={vi.fn()} />)
    expect(screen.getByText('1/2')).toBeInTheDocument()
  })

  it('shows empty state when no subtasks', () => {
    render(<TaskSubtasks taskId={1} subtasks={[]} isAdmin={false} onSubtaskChange={vi.fn()} />)
    expect(screen.getByText('Brak podzadań.')).toBeInTheDocument()
  })

  it('renders subtask titles', () => {
    render(<TaskSubtasks taskId={1} subtasks={subtasks} isAdmin={false} onSubtaskChange={vi.fn()} />)
    expect(screen.getByText('Subtask 1')).toBeInTheDocument()
    expect(screen.getByText('Subtask 2')).toBeInTheDocument()
  })

  it('completed subtask has line-through', () => {
    render(<TaskSubtasks taskId={1} subtasks={subtasks} isAdmin={false} onSubtaskChange={vi.fn()} />)
    const completedSpan = screen.getByText('Subtask 2')
    expect(completedSpan.className).toContain('line-through')
  })

  it('shows add form for admin users', () => {
    render(<TaskSubtasks taskId={1} subtasks={subtasks} isAdmin={true} onSubtaskChange={vi.fn()} />)
    expect(screen.getByPlaceholderText('Nowe podzadanie...')).toBeInTheDocument()
    expect(screen.getByText('Dodaj')).toBeInTheDocument()
  })

  it('hides add form for non-admin users', () => {
    render(<TaskSubtasks taskId={1} subtasks={subtasks} isAdmin={false} onSubtaskChange={vi.fn()} />)
    expect(screen.queryByPlaceholderText('Nowe podzadanie...')).not.toBeInTheDocument()
    expect(screen.queryByText('Dodaj')).not.toBeInTheDocument()
  })

  it('shows delete button for admin users', () => {
    render(<TaskSubtasks taskId={1} subtasks={subtasks} isAdmin={true} onSubtaskChange={vi.fn()} />)
    const deleteButtons = screen.getAllByText('Usuń')
    expect(deleteButtons).toHaveLength(2)
  })

  it('hides delete button for non-admin users', () => {
    render(<TaskSubtasks taskId={1} subtasks={subtasks} isAdmin={false} onSubtaskChange={vi.fn()} />)
    expect(screen.queryByText('Usuń')).not.toBeInTheDocument()
  })

  it('calls add API and onSubtaskChange when adding', async () => {
    const user = userEvent.setup()
    render(<TaskSubtasks taskId={1} subtasks={[]} isAdmin={true} onSubtaskChange={mockOnSubtaskChange} />)

    const input = screen.getByPlaceholderText('Nowe podzadanie...')
    await user.type(input, 'New subtask')
    await user.click(screen.getByText('Dodaj'))

    expect(mockAddSubtask).toHaveBeenCalledWith(1, 'New subtask')
    expect(mockOnSubtaskChange).toHaveBeenCalled()
  })

  it('calls complete API when checkbox is toggled', async () => {
    render(<TaskSubtasks taskId={1} subtasks={subtasks} isAdmin={false} onSubtaskChange={mockOnSubtaskChange} />)

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])

    expect(mockCompleteSubtask).toHaveBeenCalledWith(1)
  })

  it('calls delete API when delete is clicked', async () => {
    render(<TaskSubtasks taskId={1} subtasks={subtasks} isAdmin={true} onSubtaskChange={mockOnSubtaskChange} />)

    const deleteButtons = screen.getAllByText('Usuń')
    fireEvent.click(deleteButtons[0])

    expect(mockDeleteSubtask).toHaveBeenCalledWith(1)
  })

  it('adds via Enter key', async () => {
    const user = userEvent.setup()
    render(<TaskSubtasks taskId={1} subtasks={[]} isAdmin={true} onSubtaskChange={mockOnSubtaskChange} />)

    const input = screen.getByPlaceholderText('Nowe podzadanie...')
    await user.type(input, 'Enter subtask{Enter}')

    expect(mockAddSubtask).toHaveBeenCalledWith(1, 'Enter subtask')
  })

  it('does not add empty subtask', async () => {
    const user = userEvent.setup()
    render(<TaskSubtasks taskId={1} subtasks={[]} isAdmin={true} onSubtaskChange={mockOnSubtaskChange} />)

    await user.click(screen.getByText('Dodaj'))
    expect(mockAddSubtask).not.toHaveBeenCalled()
  })
})
