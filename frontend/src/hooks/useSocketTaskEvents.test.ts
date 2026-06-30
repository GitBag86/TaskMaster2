import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSocketTaskEvents } from './useSocketTaskEvents'
import type { Task } from '@/types'

/* ------------------------------------------------------------------ */
/*  Mocks                                                             */
/* ------------------------------------------------------------------ */

let mockLastTaskEvent: Record<string, unknown> | null = null

vi.mock('@/store/SocketContext', () => ({
  useSocket: () => ({ lastTaskEvent: mockLastTaskEvent }),
}))

vi.mock('@/store/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      username: 'testuser',
      role: 'manager',
      email: 'test@test.com',
      team_id: 1,
      terms_accepted: true,
      privacy_accepted: true,
      marketing_consent: false,
      consented_at: null,
      created_at: '2024-01-01T00:00:00Z',
    },
  }),
}))

/* ------------------------------------------------------------------ */
/*  Factory                                                           */
/* ------------------------------------------------------------------ */

function makeTask(id: number, overrides: Partial<Task> = {}): Task {
  return {
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
  }
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('useSocketTaskEvents', () => {
  beforeEach(() => {
    mockLastTaskEvent = null
  })

  it('calls onDelete when a deleted event arrives', () => {
    const onDelete = vi.fn()
    mockLastTaskEvent = { action: 'deleted', task_id: 42, user: 'otheruser' }
    renderHook(() => useSocketTaskEvents({ onDelete }))
    expect(onDelete).toHaveBeenCalledWith(42)
  })

  it('calls onUpdate for single-task events', () => {
    const onUpdate = vi.fn()
    const task = makeTask(1)
    mockLastTaskEvent = { action: 'updated', task, user: 'otheruser' }
    renderHook(() => useSocketTaskEvents({ onUpdate }))
    expect(onUpdate).toHaveBeenCalledWith(task)
  })

  it('calls onCreate for created events', () => {
    const onUpdate = vi.fn()
    const onCreate = vi.fn()
    const task = makeTask(1)
    mockLastTaskEvent = { action: 'created', task, user: 'otheruser' }
    renderHook(() => useSocketTaskEvents({ onUpdate, onCreate }))
    expect(onUpdate).toHaveBeenCalledWith(task)
    expect(onCreate).toHaveBeenCalledWith(task)
  })

  it('calls onUpdate but not onCreate when onCreate is not provided', () => {
    const onUpdate = vi.fn()
    const task = makeTask(1)
    mockLastTaskEvent = { action: 'created', task, user: 'otheruser' }
    renderHook(() => useSocketTaskEvents({ onUpdate }))
    expect(onUpdate).toHaveBeenCalledWith(task)
  })

  it('skips events from the same user (optimistic updates)', () => {
    const onUpdate = vi.fn()
    mockLastTaskEvent = { action: 'updated', task: makeTask(1), user: 'testuser' }
    renderHook(() => useSocketTaskEvents({ onUpdate }))
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('skips null events', () => {
    const onDelete = vi.fn()
    mockLastTaskEvent = null
    renderHook(() => useSocketTaskEvents({ onDelete }))
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('calls onBulk for bulk actions', () => {
    const onBulk = vi.fn()
    mockLastTaskEvent = { action: 'bulk_deleted', task_ids: [1, 2, 3], user: 'otheruser' }
    renderHook(() => useSocketTaskEvents({ onBulk }))
    expect(onBulk).toHaveBeenCalledWith('bulk_deleted', [1, 2, 3])
  })

  it('calls onBulk for bulk_completed', () => {
    const onBulk = vi.fn()
    mockLastTaskEvent = { action: 'bulk_completed', task_ids: [10], user: 'otheruser' }
    renderHook(() => useSocketTaskEvents({ onBulk }))
    expect(onBulk).toHaveBeenCalledWith('bulk_completed', [10])
  })

  it('calls onBulk for bulk_updated', () => {
    const onBulk = vi.fn()
    mockLastTaskEvent = { action: 'bulk_updated', task_ids: [5, 6], user: 'otheruser' }
    renderHook(() => useSocketTaskEvents({ onBulk }))
    expect(onBulk).toHaveBeenCalledWith('bulk_updated', [5, 6])
  })

  it('does not crash when no handlers are provided', () => {
    mockLastTaskEvent = { action: 'deleted', task_id: 1, user: 'otheruser' }
    expect(() => renderHook(() => useSocketTaskEvents({}))).not.toThrow()
  })

  it('uses the latest handlers after a re-render (ref pattern)', () => {
    const onDelete1 = vi.fn()
    const { rerender } = renderHook(
      ({ onDelete }: { onDelete: typeof onDelete1 }) =>
        useSocketTaskEvents({ onDelete }),
      { initialProps: { onDelete: onDelete1 } },
    )

    // First render had null event — no call
    expect(onDelete1).not.toHaveBeenCalled()

    const onDelete2 = vi.fn()
    mockLastTaskEvent = { action: 'deleted', task_id: 99, user: 'otheruser' }

    // Re-render with new handlers — effect fires because deps changed
    rerender({ onDelete: onDelete2 })

    expect(onDelete2).toHaveBeenCalledWith(99)
    expect(onDelete1).not.toHaveBeenCalled()
  })

  it('routes completed action to onUpdate', () => {
    const onUpdate = vi.fn()
    const task = makeTask(1)
    mockLastTaskEvent = { action: 'completed', task, user: 'otheruser' }
    renderHook(() => useSocketTaskEvents({ onUpdate }))
    expect(onUpdate).toHaveBeenCalledWith(task)
  })

  it('routes reopened action to onUpdate', () => {
    const onUpdate = vi.fn()
    const task = makeTask(1)
    mockLastTaskEvent = { action: 'reopened', task, user: 'otheruser' }
    renderHook(() => useSocketTaskEvents({ onUpdate }))
    expect(onUpdate).toHaveBeenCalledWith(task)
  })

  it('routes commented action to onUpdate', () => {
    const onUpdate = vi.fn()
    const task = makeTask(1)
    mockLastTaskEvent = { action: 'commented', task, user: 'otheruser' }
    renderHook(() => useSocketTaskEvents({ onUpdate }))
    expect(onUpdate).toHaveBeenCalledWith(task)
  })
})
