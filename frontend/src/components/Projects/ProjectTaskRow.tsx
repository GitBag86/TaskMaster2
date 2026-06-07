import type { Task } from "@/types"
import { priorityLabel, priorityClass } from "@/utils/helpers"

interface Props {
  task: Task
  onOpen: () => void
  onComplete: () => void
}

export default function ProjectTaskRow({ task, onOpen, onComplete }: Props) {
  const completedSubtasks = task.subtasks.filter(s => s.completed).length
  const openSubtasks = task.subtasks.length - completedSubtasks
  const isBlocked = !task.completed && task.is_blocked
  const completionBlocked = isBlocked || openSubtasks > 0
  const completionTitle = task.completed
    ? "Przywróć"
    : isBlocked
      ? "Najpierw zakończ blokujące zadania"
      : openSubtasks > 0
        ? `Najpierw zakończ podzadania: ${openSubtasks}`
        : "Zakończ"

  return (
    <div className="rounded-lg border border-border p-3 transition-colors hover:bg-muted/30">
      <div className="flex items-start justify-between gap-3">
        <button
          onClick={onOpen}
          className={`min-w-0 flex-1 text-left text-sm font-semibold hover:text-primary ${
            task.completed
              ? "line-through text-muted-foreground"
              : "text-gray-900 dark:text-white"
          }`}
        >
          {task.title}
        </button>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${priorityClass(task.priority)}`}
        >
          {priorityLabel(task.priority)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {task.due_date && (
          <span>{new Date(task.due_date).toLocaleDateString("pl-PL")}</span>
        )}
        <span>
          {task.assignees.length > 0
            ? task.assignees.map(a => a.username).join(", ")
            : "Nieprzypisane"}
        </span>
        {isBlocked && (
          <span className="font-medium text-amber-700 dark:text-amber-300">
            Zablokowane
          </span>
        )}
      </div>

      <button
        onClick={onComplete}
        disabled={completionBlocked}
        title={completionTitle}
        className={`btn btn-sm mt-3 w-full ${
          task.completed ? "btn-secondary" : "btn-primary"
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {task.completed ? "Przywróć" : "Zakończ"}
      </button>
    </div>
  )
}
