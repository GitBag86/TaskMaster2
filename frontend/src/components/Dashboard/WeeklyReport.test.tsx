import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WeeklyReportPanel from './WeeklyReport'
import type { WeeklyReport } from '@/types'

const baseReport: WeeklyReport = {
  range: { from: '2024-01-01', to: '2024-01-07' },
  summary: { created: 10, completed: 8, overdue: 3, blocked: 2, open: 15 },
  created_tasks: [],
  overdue_tasks: [],
  blocked_tasks: [],
  by_project: {
    'Projekt A': { total: 10, completed: 6, open: 4 },
    'Projekt B': { total: 5, completed: 2, open: 3 },
  },
  completed_by_user: { 'Jan': 5, 'Anna': 3 },
  generated_at: '2024-01-07T12:00:00Z',
}

describe('WeeklyReport', () => {
  it('renders the title and date range', () => {
    render(<WeeklyReportPanel report={baseReport} />)
    expect(screen.getByText('Raport tygodniowy')).toBeInTheDocument()
    expect(screen.getByText('2024-01-01 - 2024-01-07')).toBeInTheDocument()
  })

  it('renders all summary metrics', () => {
    render(<WeeklyReportPanel report={baseReport} />)
    expect(screen.getByText('Utworzone')).toBeInTheDocument()
    expect(screen.getByText('Zakończone')).toBeInTheDocument()
    expect(screen.getByText('Po terminie')).toBeInTheDocument()
    expect(screen.getByText('Zablokowane')).toBeInTheDocument()
    expect(screen.getByText('Otwarte')).toBeInTheDocument()
  })

  it('displays metric values', () => {
    render(<WeeklyReportPanel report={baseReport} />)
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    const threes = screen.getAllByText('3')
    expect(threes.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('shows the open count next to the title', () => {
    render(<WeeklyReportPanel report={baseReport} />)
    expect(screen.getByText('Otwarte teraz: 15')).toBeInTheDocument()
  })

  it('renders top projects section', () => {
    render(<WeeklyReportPanel report={baseReport} />)
    expect(screen.getByText('Najbardziej aktywne projekty')).toBeInTheDocument()
    expect(screen.getByText('Projekt A')).toBeInTheDocument()
    expect(screen.getByText('Projekt B')).toBeInTheDocument()
    expect(screen.getByText('6/10 zakończone, 4 otwarte')).toBeInTheDocument()
  })

  it('renders completions by user section', () => {
    render(<WeeklyReportPanel report={baseReport} />)
    expect(screen.getByText('Zakończenia wg osób')).toBeInTheDocument()
    expect(screen.getByText('Jan')).toBeInTheDocument()
    expect(screen.getByText('Anna')).toBeInTheDocument()
  })

  it('shows empty state when no projects data', () => {
    const empty: WeeklyReport = {
      ...baseReport,
      by_project: {},
      completed_by_user: {},
    }
    render(<WeeklyReportPanel report={empty} />)
    expect(screen.getByText('Brak danych projektowych.')).toBeInTheDocument()
    expect(screen.getByText('Brak zakończonych zadań w tym tygodniu.')).toBeInTheDocument()
  })

  it('shows empty state when no completions', () => {
    const noCompletions: WeeklyReport = {
      ...baseReport,
      by_project: { 'Projekt A': { total: 10, completed: 6, open: 4 } },
      completed_by_user: {},
    }
    render(<WeeklyReportPanel report={noCompletions} />)
    expect(screen.getByText('Brak zakończonych zadań w tym tygodniu.')).toBeInTheDocument()
  })
})
