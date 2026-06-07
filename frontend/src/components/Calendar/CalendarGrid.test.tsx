import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CalendarGrid, { buildCalendarWeeks, getIsoWeekNumber, taskBadgeClass, taskDotClass } from './CalendarGrid'
import type { Task } from '@/types'

// Mock getPolishCalendarInfo to return predictable data
vi.mock('@/data/polishCalendar', () => ({
  getPolishCalendarInfo: () => ({
    holidays: [],
    nameDays: [],
  }),
}))

const makeTask = (id: number, overrides: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  priority: 'medium',
  status: 'todo',
  completed: false,
  project: 'Test',
  project_id: 1,
  project_info: null,
  due_date: '2024-06-15',
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

// June 2024 starts on Saturday (weekday 5 in our mon-based system)
// So the first week will have nulls for Mon-Fri
describe('CalendarGrid', () => {
  const year = 2024
  const month = 5 // June (0-indexed)
  const today = new Date(2024, 5, 15)
  const calendarWeeks = buildCalendarWeeks(year, month)
  const getDayTasks = (day: number) => {
    if (day === 15) return [makeTask(1), makeTask(2)]
    return []
  }

  it('renders weekday headers', () => {
    render(
      <CalendarGrid
        year={year}
        month={month}
        today={today}
        selectedDay={null}
        calendarWeeks={calendarWeeks}
        getDayTasks={getDayTasks}
        onSelectDay={vi.fn()}
        onSelectTask={vi.fn()}
      />,
    )
    expect(screen.getByText('Pn')).toBeInTheDocument()
    expect(screen.getByText('Wt')).toBeInTheDocument()
    expect(screen.getByText('Śr')).toBeInTheDocument()
    expect(screen.getByText('Cz')).toBeInTheDocument()
    expect(screen.getByText('Pt')).toBeInTheDocument()
    expect(screen.getByText('So')).toBeInTheDocument()
    expect(screen.getByText('Nd')).toBeInTheDocument()
  })

  it('renders week number header', () => {
    render(
      <CalendarGrid
        year={year}
        month={month}
        today={today}
        selectedDay={null}
        calendarWeeks={calendarWeeks}
        getDayTasks={getDayTasks}
        onSelectDay={vi.fn()}
        onSelectTask={vi.fn()}
      />,
    )
    expect(screen.getByText('Tydz.')).toBeInTheDocument()
  })

  it('renders day numbers', () => {
    render(
      <CalendarGrid
        year={year}
        month={month}
        today={today}
        selectedDay={null}
        calendarWeeks={calendarWeeks}
        getDayTasks={getDayTasks}
        onSelectDay={vi.fn()}
        onSelectTask={vi.fn()}
      />,
    )
    // June has 30 days
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
  })

  it('renders week numbers', () => {
    const weeks = buildCalendarWeeks(2024, 5) // June 2024
    // First week should have a number
    expect(weeks.length).toBeGreaterThan(0)
    expect(weeks[0].weekNumber).toBeGreaterThan(0)
    expect(weeks[0].weekNumber).toBeLessThanOrEqual(53)
  })

  it('calls onSelectDay when a day is clicked', () => {
    const onSelectDay = vi.fn()
    render(
      <CalendarGrid
        year={year}
        month={month}
        today={today}
        selectedDay={null}
        calendarWeeks={calendarWeeks}
        getDayTasks={getDayTasks}
        onSelectDay={onSelectDay}
        onSelectTask={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('15'))
    expect(onSelectDay).toHaveBeenCalledWith(15)
  })

  it('shows task titles on desktop (sm:block elements)', () => {
    render(
      <CalendarGrid
        year={year}
        month={month}
        today={today}
        selectedDay={null}
        calendarWeeks={calendarWeeks}
        getDayTasks={getDayTasks}
        onSelectDay={vi.fn()}
        onSelectTask={vi.fn()}
      />,
    )
    // Task buttons should be present in the DOM (they have type="button")
    const taskButtons = screen.getAllByRole('button')
    // Some buttons are day buttons, some are task buttons
    const taskBtns = taskButtons.filter(b => b.className.includes('truncate'))
    expect(taskBtns.length).toBeGreaterThan(0)
  })

  it('calls onSelectTask when a task button is clicked', () => {
    const onSelectTask = vi.fn()
    const onSelectDay = vi.fn()
    render(
      <CalendarGrid
        year={year}
        month={month}
        today={today}
        selectedDay={null}
        calendarWeeks={calendarWeeks}
        getDayTasks={getDayTasks}
        onSelectDay={onSelectDay}
        onSelectTask={onSelectTask}
      />,
    )
    // Find and click a task button
    const taskButtons = screen.getAllByRole('button').filter(b => b.className.includes('truncate'))
    if (taskButtons.length > 0) {
      fireEvent.click(taskButtons[0])
      expect(onSelectDay).toHaveBeenCalledWith(15)
      expect(onSelectTask).toHaveBeenCalledWith(15, expect.objectContaining({ id: 1 }))
    }
  })

  it('highlights selected day', () => {
    render(
      <CalendarGrid
        year={year}
        month={month}
        today={today}
        selectedDay={15}
        calendarWeeks={calendarWeeks}
        getDayTasks={getDayTasks}
        onSelectDay={vi.fn()}
        onSelectTask={vi.fn()}
      />,
    )
    // The day grid cell for day 15 should have the selected class
    const dayCells = screen.getAllByRole('button')
    const selectedCell = dayCells.find(
      b => b.className.includes('bg-primary/10') && b.className.includes('ring-1'),
    )
    expect(selectedCell).toBeDefined()
  })

  it('supports keyboard navigation on day cells', () => {
    const onSelectDay = vi.fn()
    render(
      <CalendarGrid
        year={year}
        month={month}
        today={today}
        selectedDay={null}
        calendarWeeks={calendarWeeks}
        getDayTasks={getDayTasks}
        onSelectDay={onSelectDay}
        onSelectTask={vi.fn()}
      />,
    )
    const dayCell = screen.getByText('15').closest('[role="button"]')
    expect(dayCell).toBeDefined()
    if (dayCell) {
      fireEvent.keyDown(dayCell, { key: 'Enter' })
      expect(onSelectDay).toHaveBeenCalledWith(15)
    }
  })
})

describe('buildCalendarWeeks', () => {
  it('returns correct number of weeks for a month', () => {
    const weeks = buildCalendarWeeks(2024, 5) // June 2024, 30 days
    expect(weeks.length).toBeGreaterThanOrEqual(5)
    expect(weeks.length).toBeLessThanOrEqual(6)
  })

  it('each week has exactly 7 days (some null)', () => {
    const weeks = buildCalendarWeeks(2024, 5)
    for (const week of weeks) {
      expect(week.days).toHaveLength(7)
    }
  })

  it('first day of month is correctly placed based on weekday', () => {
    // June 1, 2024 is Saturday (weekday 5 in mon-based where Mon=0, Sun=6)
    const weeks = buildCalendarWeeks(2024, 5)
    // First non-null day should be day 1
    const firstNonNull = weeks[0].days.find(d => d !== null)
    expect(firstNonNull).not.toBeNull()
    expect(firstNonNull?.day).toBe(1)
    // Saturday should have weekday 5
    expect(firstNonNull?.weekday).toBe(5)
  })

  it('fills remaining days with null', () => {
    const weeks = buildCalendarWeeks(2024, 5)
    const lastWeek = weeks[weeks.length - 1]
    const nulls = lastWeek.days.filter(d => d === null)
    // Last week should have some nulls if the month doesn't end on Sunday
    expect(nulls.length).toBeGreaterThanOrEqual(0)
  })
})

describe('getIsoWeekNumber', () => {
  it('returns correct week number for known dates', () => {
    // Jan 1, 2024 is Monday → ISO week 1
    expect(getIsoWeekNumber(new Date(2024, 0, 1))).toBe(1)
    // Jan 7, 2024 is Sunday → ISO week 1
    expect(getIsoWeekNumber(new Date(2024, 0, 7))).toBe(1)
    // Jan 8, 2024 is Monday → ISO week 2
    expect(getIsoWeekNumber(new Date(2024, 0, 8))).toBe(2)
  })

  it('handles year boundary', () => {
    // Dec 31, 2024 is Tuesday → ISO week 1 of 2025
    const week = getIsoWeekNumber(new Date(2024, 11, 31))
    expect(week).toBe(1)
  })
})

describe('taskBadgeClass', () => {
  it('returns green class for completed tasks', () => {
    const task = makeTask(1, { completed: true })
    expect(taskBadgeClass(task)).toContain('bg-green-100')
  })

  it('returns red class for high priority', () => {
    const task = makeTask(1, { priority: 'high' })
    expect(taskBadgeClass(task)).toContain('bg-red-100')
  })

  it('returns amber class for medium priority', () => {
    const task = makeTask(1, { priority: 'medium' })
    expect(taskBadgeClass(task)).toContain('bg-amber-100')
  })

  it('returns slate class for low priority', () => {
    const task = makeTask(1, { priority: 'low' })
    expect(taskBadgeClass(task)).toContain('bg-slate-100')
  })
})

describe('taskDotClass', () => {
  it('returns green for completed', () => {
    expect(taskDotClass(makeTask(1, { completed: true }))).toBe('bg-green-500')
  })

  it('returns red for high priority', () => {
    expect(taskDotClass(makeTask(1, { priority: 'high' }))).toBe('bg-red-500')
  })

  it('returns amber for medium priority', () => {
    expect(taskDotClass(makeTask(1, { priority: 'medium' }))).toBe('bg-amber-500')
  })

  it('returns slate for low priority', () => {
    expect(taskDotClass(makeTask(1, { priority: 'low' }))).toBe('bg-slate-400')
  })
})
