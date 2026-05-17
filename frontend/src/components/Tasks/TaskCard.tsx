import type { Task } from '@/types'

const priorityConfig = {
  high: { label: 'Wysoki', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  medium: { label: 'Średni', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  low: { label: 'Niski', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
};

const statusConfig: Record<string, { label: string; className: string }> = {
  todo: { label: 'Do zrobienia', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  in_progress: { label: 'W toku', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  done: { label: 'Zakończone', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
};

interface Props {
  task: Task;
  onClick: () => void;
  onComplete: () => void;
}

export default function TaskCard({ task, onClick, onComplete }: Props) {
  const priority = priorityConfig[task.priority];
  const status = statusConfig[task.status] || statusConfig.todo;
  const assigneeLabel = task.assignees.length > 0
    ? task.assignees.map(assignee => assignee.username).join(', ')
    : 'Nieprzypisane';

  return (
    <div
      className={`group card cursor-pointer transition-all hover:border-primary/50 hover:shadow-md ${
        task.completed ? 'opacity-60' : ''
      }`}
      onClick={onClick}
    >
      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h3 className={`font-medium ${task.completed ? 'line-through text-muted-foreground' : 'text-gray-900 dark:text-white'}`}>
            {task.title}
          </h3>
          <button
            onClick={e => { e.stopPropagation(); onComplete(); }}
            className={`flex-shrink-0 rounded-full p-1 transition-colors ${
              task.completed
                ? 'text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30'
                : 'text-gray-300 hover:text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30'
            }`}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          <span className={`badge ${priority.className}`}>{priority.label}</span>
          <span className={`badge ${status.className}`}>{status.label}</span>
          <span className="badge bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
            {task.project}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{assigneeLabel}</span>
          {task.due_date && (
            <span className={isOverdue(task.due_date, task.completed) ? 'text-destructive' : ''}>
              {formatDate(task.due_date)}
            </span>
          )}
        </div>

        {task.subtasks.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Podzadania</span>
              <span>{task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function isOverdue(dateStr: string, completed: boolean) {
  if (completed) return false;
  return new Date(dateStr) < new Date(new Date().toDateString());
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}
