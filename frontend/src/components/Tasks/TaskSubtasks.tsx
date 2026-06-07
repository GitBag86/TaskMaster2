import type { Subtask } from "@/types"
import { useToast } from "@/store/ToastContext"
import { api } from "@/api/client"
import { useState } from "react"

interface Props {
  taskId: number
  subtasks: Subtask[]
  isAdmin: boolean
  onSubtaskChange: () => void
}

export default function TaskSubtasks({
  taskId,
  subtasks,
  isAdmin,
  onSubtaskChange,
}: Props) {
  const [newSubtask, setNewSubtask] = useState("")
  const { addToast } = useToast()

  const completedSubtasks = subtasks.filter(s => s.completed).length

  const handleAddSubtask = async () => {
    if (!newSubtask.trim()) return
    try {
      await api.subtasks.add(taskId, newSubtask)
      setNewSubtask("")
      onSubtaskChange()
      addToast("Podzadanie dodane", "success")
    } catch {
      addToast("Błąd dodawania podzadania", "error")
    }
  }

  const handleToggleSubtask = async (subtask: Subtask) => {
    try {
      await api.subtasks.complete(subtask.id)
      onSubtaskChange()
    } catch {
      addToast("Błąd zmiany stanu", "error")
    }
  }

  const handleDeleteSubtask = async (id: number) => {
    try {
      await api.subtasks.delete(id)
      onSubtaskChange()
    } catch {
      addToast("Błąd usuwania", "error")
    }
  }

  return (
    <section className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Podzadania</h4>
        <span className="text-xs text-muted-foreground">
          {completedSubtasks}/{subtasks.length}
        </span>
      </div>

      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{
            width: `${subtasks.length > 0 ? (completedSubtasks / subtasks.length) * 100 : 0}%`,
          }}
        />
      </div>

      <div className="space-y-2">
        {subtasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak podzadań.</p>
        ) : (
          subtasks.map(subtask => (
            <div
              key={subtask.id}
              className="flex items-center gap-2 rounded-lg border border-border p-2.5"
            >
              <input
                type="checkbox"
                checked={subtask.completed}
                onChange={() => void handleToggleSubtask(subtask)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span
                className={`flex-1 text-sm ${
                  subtask.completed
                    ? "line-through text-muted-foreground"
                    : "text-gray-900 dark:text-white"
                }`}
              >
                {subtask.title}
              </span>
              {isAdmin && (
                <button
                  onClick={() => void handleDeleteSubtask(subtask.id)}
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
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newSubtask}
            onChange={event => setNewSubtask(event.target.value)}
            onKeyDown={event => event.key === "Enter" && void handleAddSubtask()}
            placeholder="Nowe podzadanie..."
            className="input flex-1"
          />
          <button
            onClick={() => void handleAddSubtask()}
            className="btn btn-secondary btn-sm"
          >
            Dodaj
          </button>
        </div>
      )}
    </section>
  )
}
