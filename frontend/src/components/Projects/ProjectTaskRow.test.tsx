import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProjectTaskRow from './ProjectTaskRow'
import type { Task } from '@/types'

const makeTask = (id: number, overrides: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
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
  ...overrides,
})

describe('ProjectTaskRow', () => {
  it('renders task title', () => {
    render(<ProjectTaskRow task={makeTask(1)} onOpen={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByText('Task 1')).toBeInTheDocument()
  })

  it('shows priority badge', () => {
    render(<ProjectTaskRow task={makeTask(1, { priority: 'high' })} onOpen={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByText('Wysoki')).toBeInTheDocument()
  })

  it('shows "Nieprzypisane" when no assignees', () => {
    render(<ProjectTaskRow task={makeTask(1)} onOpen={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByText('Nieprzypisane')).toBeInTheDocument()
  })

  it('shows assignee names when present', () => {
    const task = makeTask(1, {
      assignees: [
        { id: 1, username: 'Jan', email: 'jan@test.com', role: 'user', team_id: 1, terms_accepted: true, privacy_accepted: true, marketing_consent: false, consented_at: null, created_at: '' },
      ],
    })
    render(<ProjectTaskRow task={task} onOpen={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByText('Jan')).toBeInTheDocument()
  })

  it('shows due date when present', () => {
    const task = makeTask(1, { due_date: '2024-12-25' })
    render(<ProjectTaskRow task={task} onOpen={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByText('25.12.2024')).toBeInTheDocument()
  })

  it('shows blocked indicator when task is blocked', () => {
    const task = makeTask(1, { is_blocked: true })
    render(<ProjectTaskRow task={task} onOpen={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByText('Zablokowane')).toBeInTheDocument()
  })

  it('title has line-through when completed', () => {
    const task = makeTask(1, { completed: true })
    render(<ProjectTaskRow task={task} onOpen={vi.fn()} onComplete={vi.fn()} />)
    const title = screen.getByText('Task 1')
    expect(title.className).toContain('line-through')
  })

  it('shows "Przywróć" button when completed', () => {
    const task = makeTask(1, { completed: true })
    render(<ProjectTaskRow task={task} onOpen={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByText('Przywróć')).toBeInTheDocument()
  })

  it('shows "Zakończ" button when not completed', () => {
    render(<ProjectTaskRow task={makeTask(1)} onOpen={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByText('Zakończ')).toBeInTheDocument()
  })

  it('complete button is disabled when blocked', () => {
    const task = makeTask(1, { is_blocked: true })
    render(<ProjectTaskRow task={task} onOpen={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByText('Zakończ')).toBeDisabled()
  })

  it('complete button is disabled when open subtasks exist', () => {
    const task = makeTask(1, {
      subtasks: [{ id: 1, task_id: 1, title: 'Sub', completed: false }],
    })
    render(<ProjectTaskRow task={task} onOpen={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByText('Zakończ')).toBeDisabled()
  })

  it('calls onOpen when title is clicked', () => {
    const onOpen = vi.fn()
    render(<ProjectTaskRow task={makeTask(1)} onOpen={onOpen} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Task 1'))
    expect(onOpen).toHaveBeenCalled()
  })

  it('calls onComplete when complete button is clicked', () => {
    const onComplete = vi.fn()
    render(<ProjectTaskRow task={makeTask(1, { is_blocked: false })} onOpen={vi.fn()} onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Zakończ'))
    expect(onComplete).toHaveBeenCalled()
  })
})
