import type { Task } from "@/types"
import { isAdminRole } from "@/types"
import { useAuth } from "@/store/AuthContext"
import { useToast } from "@/store/ToastContext"
import { api } from "@/api/client"
import { priorityLabel, statusLabel, formatDateTime } from "@/utils/helpers"

interface Props {
  task: Task
  isBlocked: boolean
  blockedByCount: number
  openSubtasks: number
  hasOpenSubtasks: boolean
  completionBlocked: boolean
  completionBlockedTitle: string | undefined
  canStartTask: boolean
  onEdit: () => void
  onComplete: () => void
  onStart: () => void
  onDelete: () => void
  onUpdate: (task: Task) => void
}

export default function TaskHeader({
  task,
  isBlocked,
  blockedByCount,
  openSubtasks,
  hasOpenSubtasks,
  completionBlocked,
  completionBlockedTitle,
  canStartTask,
  onEdit,
  onComplete,
  onStart,
  onDelete,
  onUpdate,
}: Props) {
  const { user } = useAuth()
  const { addToast } = useToast()
  const isAdmin = isAdminRole(user?.role)

  const handleClearAssignee = async () => {
    try {
      const updatedTask = await api.tasks.update(task.id, { assignee_ids: [] })
      onUpdate(updatedTask)
      addToast("Przypisanie usunięte", "success")
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd usuwania przypisania",
        "error",
      )
    }
  }

  const assigneeLabel =
    task.assignees.length > 0
      ? task.assignees.map(a => a.username).join(", ")
      : "Nieprzypisane"

  return (
    <div className="border-b border-border p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {task.project}
          </p>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            {task.title}
          </h3>
        </div>
        {isAdmin && (
          <button onClick={onEdit} className="btn btn-secondary btn-sm">
            Edytuj
          </button>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Badge>{priorityLabel(task.priority)}</Badge>
        <Badge>{statusLabel(task.status)}</Badge>
        {isBlocked && (
          <Badge tone="warning">Zablokowane przez {blockedByCount}</Badge>
        )}
        {hasOpenSubtasks && (
          <Badge tone="warning">Otwarte podzadania: {openSubtasks}</Badge>
        )}
        {task.due_date && <Badge>{task.due_date}</Badge>}
      </div>

      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div className="flex flex-wrap items-center gap-2">
          <p>
            <span className="font-medium">Przypisani:</span> {assigneeLabel}
          </p>
          {isAdmin && task.assignees.length > 0 && (
            <button
              onClick={() => void handleClearAssignee()}
              className="text-xs font-medium text-destructive hover:underline"
            >
              Usuń przypisanie
            </button>
          )}
        </div>
        <p>
          <span className="font-medium">Utworzono:</span>{" "}
          {formatDateTime(task.created_at)}
        </p>
      </div>

      {/* Action buttons */}
      <div className="mt-4 flex justify-between gap-3 border-t border-border pt-4">
        <div className="flex flex-wrap gap-2">
          {canStartTask && (
            <button onClick={onStart} className="btn btn-secondary btn-sm">
              Ustaw w toku
            </button>
          )}            <button
              onClick={onComplete}
              disabled={completionBlocked}
              title={completionBlockedTitle}
              className={`btn btn-sm ${task.completed ? "btn-secondary" : "btn-primary"} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {task.completed ? "Przywróć zadanie" : "Oznacz jako zakończone"}
            </button>
        </div>
        {isAdmin && (
          <button onClick={onDelete} className="btn btn-destructive btn-sm">
            Usuń zadanie
          </button>
        )}
      </div>
    </div>
  )
}

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode
  tone?: "default" | "warning"
}) {
  const className =
    tone === "warning"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
  return <span className={`badge ${className}`}>{children}</span>
}
