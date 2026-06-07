import type { Task } from '@/types'

export interface TaskEvent {
  action: string
  user?: string
  timestamp?: string
  task_id?: number
  task?: Task
  task_ids?: number[]
  mentioned_usernames?: string[]
}

/** Actions that carry a single task payload suitable for in-place update */
const SINGLE_TASK_ACTIONS = new Set([
  'created',
  'updated',
  'completed',
  'reopened',
  'commented',
  'mentioned',
  'subtask_created',
  'subtask_completed',
  'subtask_reopened',
  'subtask_deleted',
  'dependency_added',
  'dependency_removed',
])

/** Whether this event can be handled via partial in-place update. */
export function canPartiallyUpdate(event: TaskEvent): boolean {
  if (!event) return false
  if (event.action === 'deleted' && event.task_id) return true
  if (event.task && SINGLE_TASK_ACTIONS.has(event.action)) return true
  return false
}

/** Replace a single task in an array (immutable). */
export function replaceTaskInList(tasks: Task[], updatedTask: Task): Task[] {
  const index = tasks.findIndex(t => t.id === updatedTask.id)
  if (index === -1) return tasks
  const next = [...tasks]
  next[index] = updatedTask
  return next
}

/** Remove a task from an array (immutable). */
export function removeTaskFromList(tasks: Task[], taskId: number): Task[] {
  return tasks.filter(t => t.id !== taskId)
}

/** Inject task updates into an array of projects with optional tasks (immutable). */
export function updateTaskInProjects<T extends { id: number; tasks?: Task[] | null }>(
  projects: T[],
  event: TaskEvent,
): T[] {
  const removeTask = (tasks: Task[] | undefined | null, taskId: number): Task[] =>
    (tasks ?? []).filter(t => t.id !== taskId)

  // Deletion: remove task from any project's task list
  if (event.action === 'deleted' && event.task_id) {
    return projects.map(p => ({
      ...p,
      tasks: removeTask(p.tasks, event.task_id!),
    }))
  }

  if (event.task && SINGLE_TASK_ACTIONS.has(event.action)) {
    const updatedTask = event.task

    // For created tasks with a project_id, prepend to that project
    if (event.action === 'created' && updatedTask.project_id != null) {
      return projects.map(p =>
        p.id === updatedTask.project_id
          ? { ...p, tasks: [updatedTask, ...(p.tasks ?? [])] }
          : p,
      )
    }

    // Update, complete, reopen, etc. — find and replace across all projects
    // Also handles project-move: if task moved from one project to another
    return projects.map(p => {
      const list = p.tasks ?? []
      const idx = list.findIndex(t => t.id === updatedTask.id)
      if (idx === -1) {
        // Task not in this project — maybe it moved here
        if (updatedTask.project_id != null && p.id === updatedTask.project_id) {
          return { ...p, tasks: [updatedTask, ...list] }
        }
        return p
      }
      // Task found — update in place or remove if project changed
      if (updatedTask.project_id != null && p.id !== updatedTask.project_id) {
        return { ...p, tasks: list.filter(t => t.id !== updatedTask.id) }
      }
      const next = [...list]
      next[idx] = updatedTask
      return { ...p, tasks: next }
    })
  }

  return projects
}
