import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProjectList from './ProjectList'
import type { Task } from '@/types'

const makeSummary = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Project ${id}`,
  description: 'A test project',
  color: '#3b82f6',
  archived: false,
  members: [],
  created_by_id: null,
  created_at: null,
  tasks: [] as Task[],
  total: 10,
  completed: 6,
  open: 4,
  blocked: 1,
  overdue: 2,
  highPriority: 1,
  nextDueDate: '2024-03-01',
  readyToComplete: false,
  ...overrides,
})

describe('ProjectList', () => {
  it('renders all project summaries', () => {
    const summaries = [makeSummary(1), makeSummary(2)]
    render(<ProjectList summaries={summaries} selectedProjectId={null} onSelect={vi.fn()} />)
    expect(screen.getByText('Project 1')).toBeInTheDocument()
    expect(screen.getByText('Project 2')).toBeInTheDocument()
  })

  it('renders the description when provided', () => {
    const summaries = [makeSummary(1)]
    render(<ProjectList summaries={summaries} selectedProjectId={null} onSelect={vi.fn()} />)
    expect(screen.getByText('A test project')).toBeInTheDocument()
  })

  it('shows completed/total when no description', () => {
    const summaries = [makeSummary(1, { description: '' })]
    render(<ProjectList summaries={summaries} selectedProjectId={null} onSelect={vi.fn()} />)
    expect(screen.getByText('6/10 zakończone')).toBeInTheDocument()
  })

  it('shows the total task count badge', () => {
    const summaries = [makeSummary(1)]
    render(<ProjectList summaries={summaries} selectedProjectId={null} onSelect={vi.fn()} />)
    expect(screen.getByText('10')).toBeInTheDocument()
  })

  it('renders stat labels for each project', () => {
    const summaries = [makeSummary(1)]
    render(<ProjectList summaries={summaries} selectedProjectId={null} onSelect={vi.fn()} />)
    expect(screen.getByText('Po terminie')).toBeInTheDocument()
    expect(screen.getByText('Wysoki')).toBeInTheDocument()
    expect(screen.getByText('Najbliżej')).toBeInTheDocument()
  })

  it('renders the due date in Najbliżej stat', () => {
    const summaries = [makeSummary(1, { nextDueDate: '2024-03-15' })]
    render(<ProjectList summaries={summaries} selectedProjectId={null} onSelect={vi.fn()} />)
    // formatShortDate returns Polish short format like "15 mar"
    expect(screen.getByText('15 mar')).toBeInTheDocument()
  })

  it('renders dash when no due date', () => {
    const summaries = [makeSummary(1, { nextDueDate: null })]
    render(<ProjectList summaries={summaries} selectedProjectId={null} onSelect={vi.fn()} />)
    expect(screen.getByText('-')).toBeInTheDocument()
  })

  it('highlights selected project', () => {
    const summaries = [makeSummary(1), makeSummary(2)]
    const { container } = render(
      <ProjectList summaries={summaries} selectedProjectId={1} onSelect={vi.fn()} />,
    )
    // The selected project card should have the ring class
    const buttons = container.querySelectorAll('button')
    expect(buttons[0].className).toContain('ring-2')
    expect(buttons[1].className).not.toContain('ring-2')
  })

  it('calls onSelect when a project is clicked', () => {
    const onSelect = vi.fn()
    const summaries = [makeSummary(1), makeSummary(42)]
    render(<ProjectList summaries={summaries} selectedProjectId={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Project 42'))
    expect(onSelect).toHaveBeenCalledWith(42)
  })

  it('shows archived projects with reduced opacity', () => {
    const summaries = [makeSummary(1, { archived: true })]
    const { container } = render(
      <ProjectList summaries={summaries} selectedProjectId={null} onSelect={vi.fn()} />,
    )
    const button = container.querySelector('button')
    expect(button?.className).toContain('opacity-65')
  })
})
