import type { Task } from '@/types'

/** Returns Polish label for a given priority. */
export function priorityLabel(priority: Task['priority'] | string): string {
  return priority === 'high' ? 'Wysoki' : priority === 'medium' ? 'Średni' : 'Niski'
}

/** Returns Tailwind CSS classes for a given priority badge. */
export function priorityClass(priority: Task['priority'] | string): string {
  if (priority === 'high') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  if (priority === 'medium') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
}

/** Checks if a date string is past today. */
export function isOverdue(dateStr: string, completed: boolean): boolean {
  if (completed) return false
  return new Date(dateStr) < new Date(new Date().toDateString())
}

/** Formats a date string as "DD month" in Polish (e.g. "15 sty"). */
export function formatShortDate(date: string): string {
  return new Date(date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
}

/** Formats a date string with weekday in Polish (e.g. "pon., 15 sty"). */
export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Formats a date string as full date+time in Polish. */
export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('pl-PL')
}

/** Returns Polish text for a given status. */
export function statusText(status: string): string {
  return (
    { todo: 'do zrobienia', in_progress: 'w toku', done: 'zakończone' }[status] || status
  )
}

/** Returns a labelled Polish status string. */
export function statusLabel(status: string): string {
  return `Status: ${statusText(status)}`
}
