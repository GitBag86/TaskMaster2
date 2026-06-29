import { useEffect, useRef } from 'react'
import { useSocket } from '@/store/SocketContext'
import { useAuth } from '@/store/AuthContext'
import { canPartiallyUpdate } from '@/utils/taskEventHelpers'
import type { Task } from '@/types'

export interface SocketTaskEventHandlers {
  /** Called when a task is deleted by another user. */
  onDelete?: (taskId: number) => void
  /** Called when a single task is created/updated/completed/reopened/commented etc. */
  onUpdate?: (task: Task) => void
  /** Called when a task was created by another user (for incrementing counters). */
  onCreate?: (task: Task) => void
  /** Called on bulk actions — full reload recommended. */
  onBulk?: (action: string, taskIds: number[]) => void
}

/**
 * Processes `lastTaskEvent` from the socket context and dispatches to the
 * provided callbacks. Handles the common filtering (skip own events, null guard,
 * action routing) so every page doesn't duplicate the same useEffect pattern.
 *
 * Callbacks are stored via ref so they don't need useCallback wrapping.
 *
 * @example
 * ```tsx
 * useSocketTaskEvents({
 *   onDelete: (id) => setTasks(prev => prev.filter(t => t.id !== id)),
 *   onUpdate: (task) => replaceTask(task),
 *   onCreate: () => setTotal(prev => prev + 1),
 *   onBulk: () => void fetchTasks(),
 * })
 * ```
 */
export function useSocketTaskEvents(handlers: SocketTaskEventHandlers) {
  const { lastTaskEvent } = useSocket()
  const { user } = useAuth()
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const event = lastTaskEvent
    if (!event || event.user === user?.username) return

    // Deletion
    if (event.action === 'deleted' && event.task_id) {
      handlersRef.current.onDelete?.(event.task_id)
      return
    }

    // Single-task composite actions (created, updated, completed, etc.)
    if (event.task && canPartiallyUpdate(event)) {
      handlersRef.current.onUpdate?.(event.task)
      if (event.action === 'created') {
        handlersRef.current.onCreate?.(event.task)
      }
      return
    }

    // Bulk actions — fallback full reload
    if (event.task_ids && ['bulk_deleted', 'bulk_completed', 'bulk_updated'].includes(event.action)) {
      handlersRef.current.onBulk?.(event.action, event.task_ids)
      return
    }
  }, [lastTaskEvent, user?.username])
}
