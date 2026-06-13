import { useCallback, useEffect, useMemo, useState } from "react"
import type { Task, ActivityLog } from "@/types"
import { isAdminRole } from "@/types"
import { api } from "@/api/client"
import { useToast } from "@/store/ToastContext"
import { useAuth } from "@/store/AuthContext"
import TaskForm from "./TaskForm"
import TaskHeader from "./TaskHeader"
import TaskComments from "./TaskComments"
import TaskSubtasks from "./TaskSubtasks"
import TaskDependencies from "./TaskDependencies"
import { formatDateTime } from "@/utils/helpers"

interface Props {
  task: Task
  onDelete: (id: number) => void
  onComplete: (id: number) => void
  onUpdate: (task: Task) => void
  onClose: () => void
}

interface TaskFormData {
  title: string
  assignee_ids?: number[]
  priority?: "low" | "medium" | "high"
  project?: string
  due_date?: string
  notes?: string
}

export default function TaskDetail({ task, onDelete, onComplete, onUpdate, onClose }: Props) {
  const [subtasks, setSubtasks] = useState(task.subtasks)
  const [comments, setComments] = useState(task.comments)
  const [dependencies, setDependencies] = useState(task.dependencies)
  const [blockedBy, setBlockedBy] = useState(task.blocked_by)
  const [blocking, setBlocking] = useState(task.blocking)
  const [isEditing, setIsEditing] = useState(false)
  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [activityLoading, setActivityLoading] = useState(true)
  const { addToast } = useToast()
  const { user } = useAuth()

  const isAdmin = isAdminRole(user?.role)
  const isBlocked = task.is_blocked && !task.completed
  const completedSubtasks = useMemo(() => subtasks.filter(s => s.completed).length, [subtasks])
  const openSubtasks = subtasks.length - completedSubtasks
  const hasOpenSubtasks = !task.completed && openSubtasks > 0
  const completionBlocked = isBlocked || hasOpenSubtasks
  const completionBlockedTitle = isBlocked
    ? "Najpierw zakończ blokujące zadania"
    : hasOpenSubtasks
      ? `Najpierw zakończ podzadania: ${openSubtasks}`
      : undefined
  const canStartTask = !isAdmin && !task.completed && task.status === "todo"

  useEffect(() => {
    setSubtasks(task.subtasks)
    setComments(task.comments)
    setDependencies(task.dependencies)
    setBlockedBy(task.blocked_by)
    setBlocking(task.blocking)
  }, [task.blocked_by, task.blocking, task.comments, task.dependencies, task.subtasks])

  useEffect(() => {
    const loadActivity = async () => {
      setActivityLoading(true)
      try {
        const response = await api.activity.getForTask(task.id)
        setActivity(response.activity)
      } catch {
        setActivity([])
      } finally {
        setActivityLoading(false)
      }
    }
    void loadActivity()
  }, [task.id])

  const fetchActivity = async () => {
    try {
      const response = await api.activity.getForTask(task.id)
      setActivity(response.activity)
    } catch {
      setActivity([])
    }
  }

  const refreshTask = useCallback(async () => {
    try {
      const updated = await api.tasks.get(task.id)
      setSubtasks(updated.subtasks)
      setComments(updated.comments)
      setDependencies(updated.dependencies)
      setBlockedBy(updated.blocked_by)
      setBlocking(updated.blocking)
    } catch {
      // silently fail — next mount will reconcile
    }
  }, [task.id])

  const handleStartTask = async () => {
    try {
      const updatedTask = await api.tasks.update(task.id, {
        status: "in_progress",
        completed: false,
      })
      onUpdate(updatedTask)
      addToast("Zadanie ustawione jako w toku", "success")
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : "Błąd zmiany statusu", "error")
    }
  }

  const editInitialData: TaskFormData = {
    title: task.title,
    assignee_ids: task.assignees.map(a => a.id),
    priority: task.priority,
    project: task.project,
    due_date: task.due_date ?? "",
    notes: task.notes,
  }

  const handleUpdateTask = async (data: TaskFormData) => {
    try {
      const updatedTask = await api.tasks.update(task.id, data)
      onUpdate(updatedTask)
      setIsEditing(false)
      addToast("Zadanie zaktualizowane", "success")
      onClose()
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : "Błąd aktualizacji zadania", "error")
      throw err
    }
  }

  if (isEditing) {
    return (
      <TaskForm
        initialData={editInitialData}
        submitLabel="Zapisz"
        onSubmit={data => handleUpdateTask(data)}
        onCancel={() => setIsEditing(false)}
      />
    )
  }

  return (
    <div className="flex max-h-[80vh] flex-col">
      <TaskHeader
        task={task}
        isBlocked={isBlocked}
        blockedByCount={blockedBy.length}
        openSubtasks={openSubtasks}
        hasOpenSubtasks={hasOpenSubtasks}
        completionBlocked={completionBlocked}
        completionBlockedTitle={completionBlockedTitle}
        canStartTask={canStartTask}
        onEdit={() => setIsEditing(true)}
        onComplete={() => onComplete(task.id)}
        onStart={() => void handleStartTask()}
        onDelete={() => onDelete(task.id)}
        onUpdate={onUpdate}
      />

      <div className="space-y-6 overflow-y-auto p-5">
        {/* Notes */}
        <section className="rounded-lg border border-border p-4">
          <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Notatki</h4>
          {task.notes ? (
            <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
              {task.notes}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Brak notatek dla tego zadania.</p>
          )}
        </section>

        <TaskDependencies
          task={task}
          dependencies={dependencies}
          blocking={blocking}
          onDependencyChange={fetchActivity}
        />

        <TaskSubtasks
          taskId={task.id}
          subtasks={subtasks}
          isAdmin={isAdmin}
          onSubtaskChange={refreshTask}
        />

        <TaskComments
          taskId={task.id}
          comments={comments}
          onCommentChange={fetchActivity}
        />

        {/* Activity History */}
        <section className="rounded-lg border border-border p-4">
          <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Historia zmian</h4>
          {activityLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="border-l-2 border-primary/10 pl-3">
                  <div className="skeleton mb-1 h-4 w-3/4" />
                  <div className="skeleton h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak zapisanej aktywności.</p>
          ) : (
            <div className="space-y-3">
              {activity.map(item => (
                <div key={item.id} className="border-l-2 border-primary/30 pl-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {activityLabel(item.action)}
                    </p>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDateTime(item.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.username ?? "System"}
                  </p>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                    {activityDetails(item)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function activityLabel(action: string) {
  return (
    {
      created: "Utworzono zadanie",
      updated: "Zaktualizowano zadanie",
      completed: "Zakończono zadanie",
      reopened: "Przywrócono zadanie",
      commented: "Dodano komentarz",
      mentioned: "Dodano wzmiankę",
      subtask_created: "Dodano podzadanie",
      subtask_toggle: "Zmieniono podzadanie",
      subtask_deleted: "Usunięto podzadanie",
      dependency_added: "Dodano zależność",
      dependency_removed: "Usunięto zależność",
    }[action] || action
  )
}

function activityDetails(item: ActivityLog) {
  const details = item.details ?? {}
  const changes = details.changes

  if (changes && typeof changes === "object" && !Array.isArray(changes)) {
    const labels = Object.entries(
      changes as Record<string, { from?: unknown; to?: unknown }>,
    ).map(
      ([field, change]) =>
        `${fieldLabel(field)}: ${formatChangeValue(change.from)} -> ${formatChangeValue(change.to)}`,
    )
    return labels.join(", ") || "Zmieniono dane zadania."
  }

  if (typeof details.title === "string") return details.title
  if (typeof details.text === "string") return details.text
  if (typeof details.subtask === "string") return details.subtask
  return "Zapisano zdarzenie."
}

function fieldLabel(field: string) {
  return (
    {
      title: "Tytuł",
      priority: "Priorytet",
      project: "Projekt",
      project_id: "Projekt",
      due_date: "Termin",
      notes: "Notatki",
      completed: "Ukończone",
      status: "Status",
      assignee_ids: "Przypisani",
    }[field] || field
  )
}

function formatChangeValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-"
  if (Array.isArray(value)) return value.join(", ") || "-"
  if (typeof value === "boolean") return value ? "tak" : "nie"
  return String(value)
}
