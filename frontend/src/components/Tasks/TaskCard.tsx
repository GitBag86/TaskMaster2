import type { Task } from '@/types'

const priorityConfig = {
  high: { label: 'Wysoki', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', accent: 'border-l-red-500' },
  medium: { label: 'Średni', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', accent: 'border-l-amber-500' },
  low: { label: 'Niski', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', accent: 'border-l-green-500' },
}

const statusConfig: Record<string, { label: string; className: string }> = {
  todo: { label: 'Do zrobienia', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  in_progress: { label: 'W toku', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  done: { label: 'Zakończone', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
}

interface Props {
  task: Task;
  onClick: () => void;
  onComplete: () => void;
}

export default function TaskCard({ task, onClick, onComplete }: Props) {
  const priority = priorityConfig[task.priority]
  const status = statusConfig[task.status] || statusConfig.todo
  const completedSubtasks = task.subtasks.filter(subtask => subtask.completed).length

  return (
    <div
      className={`group card cursor-pointer border-l-4 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md ${
        priority.accent
      } ${task.completed ? 'opacity-70' : ''}`}
      onClick={onClick}
    >
      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{task.project}</p>
            <h3 className={`truncate text-base font-semibold ${task.completed ? 'line-through text-muted-foreground' : 'text-gray-900 dark:text-white'}`}>
              {task.title}
            </h3>
          </div>
          <button
            onClick={event => {
              event.stopPropagation()
              onComplete()
            }}
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
              task.completed
                ? 'border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400'
                : 'border-gray-200 text-gray-400 hover:border-green-300 hover:text-green-600 dark:border-gray-700 dark:text-gray-500'
            }`}
            title={task.completed ? 'Przywróć zadanie' : 'Zakończ zadanie'}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          <span className={`badge ${priority.className}`}>{priority.label}</span>
          <span className={`badge ${status.className}`}>{status.label}</span>
          {task.due_date && (
            <span className={`badge ${isOverdue(task.due_date, task.completed)
              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
              {isOverdue(task.due_date, task.completed) ? 'Po terminie' : 'Termin'}: {formatDate(task.due_date)}
            </span>
          )}
        </div>

        <div className="mb-3 flex min-h-[1.75rem] items-center gap-1.5">
          {task.assignees.length === 0 ? (
            <span className="text-xs text-muted-foreground">Nieprzypisane</span>
          ) : (
            <>
              {task.assignees.slice(0, 2).map(assignee => (
                <span key={assignee.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold">
                    {assignee.username.charAt(0).toUpperCase()}
                  </span>
                  {assignee.username}
                </span>
              ))}
              {task.assignees.length > 2 && (
                <span className="text-xs text-muted-foreground">+{task.assignees.length - 2}</span>
              )}
            </>
          )}
        </div>

        {task.subtasks.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Postęp podzadań</span>
              <span>{completedSubtasks}/{task.subtasks.length}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(completedSubtasks / task.subtasks.length) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function isOverdue(dateStr: string, completed: boolean) {
  if (completed) return false
  return new Date(dateStr) < new Date(new Date().toDateString())
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
}
