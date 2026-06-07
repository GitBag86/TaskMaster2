import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DependencyBoard from './DependencyBoard'
import type { DependencyBoardResponse, Task } from '@/types'

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

const baseBoard: DependencyBoardResponse = {
  blocked: [
    makeTask(1, { is_blocked: true, blocked_by: [{ id: 2, title: 'Blocker', status: 'todo', completed: false, project: 'Test', due_date: null }] }),
    makeTask(2, { is_blocked: true }),
  ],
  blockers: [
    {
      id: 3,
      title: 'Big Blocker',
      status: 'todo',
      completed: false,
      project: 'Test',
      due_date: null,
      blocking_count: 3,
      blocking_tasks: [
        { id: 4, title: 'Blocked A', status: 'todo', completed: false, project: 'Test', due_date: null },
        { id: 5, title: 'Blocked B', status: 'todo', completed: false, project: 'Test', due_date: null },
      ],
    },
  ],
  ready: [makeTask(6, { priority: 'high', due_date: '2024-02-01' })],
  counts: { blocked: 2, blockers: 1, ready: 1 },
  generated_at: '2024-01-07T12:00:00Z',
}

describe('DependencyBoard', () => {
  it('renders the title', () => {
    render(<DependencyBoard board={baseBoard} />)
    expect(screen.getByText('Blokady')).toBeInTheDocument()
  })

  it('renders count metrics', () => {
    render(<DependencyBoard board={baseBoard} />)
    const zablokowane = screen.getAllByText('Zablokowane')
    expect(zablokowane.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Blokery')).toBeInTheDocument()
    expect(screen.getByText('Gotowe')).toBeInTheDocument()
  })

  it('renders all three columns', () => {
    render(<DependencyBoard board={baseBoard} />)
    const zablokowane = screen.getAllByText('Zablokowane')
    expect(zablokowane.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Największe blokery')).toBeInTheDocument()
    expect(screen.getByText('Gotowe do pracy')).toBeInTheDocument()
  })

  it('renders blocked tasks', () => {
    render(<DependencyBoard board={baseBoard} />)
    expect(screen.getByText('Task 1')).toBeInTheDocument()
    expect(screen.getByText('Task 2')).toBeInTheDocument()
  })

  it('renders blocker tasks with counts', () => {
    render(<DependencyBoard board={baseBoard} />)
    expect(screen.getByText('Big Blocker')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders ready tasks', () => {
    render(<DependencyBoard board={baseBoard} />)
    expect(screen.getByText('Task 6')).toBeInTheDocument()
  })

  it('shows empty states when lists are empty', () => {
    const emptyBoard: DependencyBoardResponse = {
      blocked: [],
      blockers: [],
      ready: [],
      counts: { blocked: 0, blockers: 0, ready: 0 },
      generated_at: '2024-01-07T12:00:00Z',
    }
    render(<DependencyBoard board={emptyBoard} />)
    expect(screen.getByText('Nic nie czeka na zależności.')).toBeInTheDocument()
    expect(screen.getByText('Żadne zadanie nie blokuje innych.')).toBeInTheDocument()
    expect(screen.getByText('Brak otwartych zadań bez blokad.')).toBeInTheDocument()
  })
})
