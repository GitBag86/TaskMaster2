import type { Task, TaskSummary, TaskDependency as TaskDependencyType } from "@/types"
import { isAdminRole } from "@/types"
import { useAuth } from "@/store/AuthContext"
import { useToast } from "@/store/ToastContext"
import { api } from "@/api/client"
import { statusText } from "@/utils/helpers"
import { useState, useEffect } from "react"

interface Props {
  task: Task
  dependencies: TaskDependencyType[]
  blocking: TaskSummary[]
  onDependencyChange: () => void
}

export default function TaskDependencies({
  task,
  dependencies,
  blocking,
  onDependencyChange,
}: Props) {
  const { user } = useAuth()
  const { addToast } = useToast()
  const isAdmin = isAdminRole(user?.role)
  const isBlocked = task.is_blocked && !task.completed
  const [availableTasks, setAvailableTasks] = useState<TaskSummary[]>([])
  const [selectedDependencyId, setSelectedDependencyId] = useState("")

  useEffect(() => {
    if (!isAdmin) return
    const loadAvailable = async () => {
      try {
        const response = await api.tasks.getAll(1, 200)
        setAvailableTasks(
          response.tasks.map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            completed: t.completed,
            project: t.project,
            due_date: t.due_date,
          })),
        )
      } catch {
        setAvailableTasks([])
      }
    }
    void loadAvailable()
  }, [isAdmin])

  const existingDependencyIds = new Set(
    dependencies.map(d => d.depends_on_task_id),
  )
  const dependencyOptions = availableTasks.filter(
    t => t.id !== task.id && !existingDependencyIds.has(t.id),
  )

  const handleAddDependency = async () => {
    const dependsOnTaskId = Number(selectedDependencyId)
    if (!dependsOnTaskId) return

    try {
      await api.tasks.addDependency(task.id, dependsOnTaskId)
      setSelectedDependencyId("")
      onDependencyChange()
      addToast("Zależność dodana", "success")
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd dodawania zależności",
        "error",
      )
    }
  }

  const handleRemoveDependency = async (dependencyId: number) => {
    try {
      await api.tasks.removeDependency(dependencyId)
      onDependencyChange()
      addToast("Zależność usunięta", "success")
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd usuwania zależności",
        "error",
      )
    }
  }

  return (
    <section className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Zależności</h4>
          {isBlocked && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              Zadanie można zakończyć dopiero po zamknięciu blokujących zadań.
            </p>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{dependencies.length}</span>
      </div>

      <div className="space-y-2">
        {dependencies.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak zależności.</p>
        ) : (
          dependencies.map(dependency => (
            <div
              key={dependency.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                  {dependency.depends_on_task?.title ?? `Zadanie #${dependency.depends_on_task_id}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {dependency.depends_on_task
                    ? summaryMeta(dependency.depends_on_task)
                    : "Szczegóły niedostępne"}
                </p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => void handleRemoveDependency(dependency.id)}
                  className="text-xs font-medium text-destructive hover:underline"
                >
                  Usuń
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {isAdmin && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <select
            value={selectedDependencyId}
            onChange={event => setSelectedDependencyId(event.target.value)}
            className="input flex-1"
          >
            <option value="">Dodaj blokujące zadanie</option>
            {dependencyOptions.map(opt => (
              <option key={opt.id} value={opt.id}>
                {opt.title}
              </option>
            ))}
          </select>
          <button
            onClick={() => void handleAddDependency()}
            disabled={!selectedDependencyId}
            className="btn btn-secondary btn-sm"
          >
            Dodaj
          </button>
        </div>
      )}

      {blocking.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Blokuje
          </h5>
          <div className="space-y-1.5">
            {blocking.map(blockedTask => (
              <div
                key={blockedTask.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate text-gray-700 dark:text-gray-300">
                  {blockedTask.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {statusText(blockedTask.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function summaryMeta(task: TaskSummary) {
  const status = statusText(task.status)
  const dueDate = task.due_date
    ? `, termin: ${new Date(task.due_date).toLocaleDateString("pl-PL")}`
    : ""
  return `${task.project} - ${status}${dueDate}`
}
