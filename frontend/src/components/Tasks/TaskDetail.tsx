import { useEffect, useMemo, useState } from 'react'
import type { Task, Subtask } from '@/types'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'
import { useAuth } from '@/store/AuthContext'

interface Props {
  task: Task;
  onDelete: (id: number) => void;
  onComplete: (id: number) => void;
}

export default function TaskDetail({ task, onDelete, onComplete }: Props) {
  const [subtasks, setSubtasks] = useState(task.subtasks)
  const [newSubtask, setNewSubtask] = useState('')
  const [newComment, setNewComment] = useState('')
  const [comments, setComments] = useState(task.comments)
  const { addToast } = useToast()
  const { user } = useAuth()

  useEffect(() => {
    setSubtasks(task.subtasks)
    setComments(task.comments)
  }, [task.comments, task.subtasks])

  const completedSubtasks = useMemo(
    () => subtasks.filter(subtask => subtask.completed).length,
    [subtasks],
  )

  const handleAddSubtask = async () => {
    if (!newSubtask.trim()) return
    try {
      const subtask = await api.subtasks.add(task.id, newSubtask)
      setSubtasks(prev => [...prev, subtask])
      setNewSubtask('')
      addToast('Podzadanie dodane', 'success')
    } catch {
      addToast('Błąd dodawania podzadania', 'error')
    }
  }

  const handleToggleSubtask = async (subtask: Subtask) => {
    try {
      await api.subtasks.complete(subtask.id)
      setSubtasks(prev => prev.map(item => (item.id === subtask.id ? { ...item, completed: !item.completed } : item)))
    } catch {
      addToast('Błąd zmiany stanu', 'error')
    }
  }

  const handleDeleteSubtask = async (id: number) => {
    try {
      await api.subtasks.delete(id)
      setSubtasks(prev => prev.filter(item => item.id !== id))
    } catch {
      addToast('Błąd usuwania', 'error')
    }
  }

  const handleAddComment = async () => {
    if (!newComment.trim()) return
    try {
      const comment = await api.comments.add(task.id, newComment)
      setComments(prev => [...prev, comment])
      setNewComment('')
    } catch {
      addToast('Błąd dodawania komentarza', 'error')
    }
  }

  const assigneeLabel = task.assignees.length > 0
    ? task.assignees.map(assignee => assignee.username).join(', ')
    : 'Nieprzypisane'

  return (
    <div className="flex max-h-[80vh] flex-col">
      <div className="border-b border-border p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{task.project}</p>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{task.title}</h3>
          </div>
          <button onClick={() => onComplete(task.id)} className={`btn btn-sm ${task.completed ? 'btn-secondary' : 'btn-primary'}`}>
            {task.completed ? 'Przywróć' : 'Zakończ'}
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <Badge>{priorityLabel(task.priority)}</Badge>
          <Badge>{statusLabel(task.status)}</Badge>
          {task.due_date && <Badge>{task.due_date}</Badge>}
        </div>

        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <p><span className="font-medium">Przypisani:</span> {assigneeLabel}</p>
          <p><span className="font-medium">Utworzono:</span> {formatDateTime(task.created_at)}</p>
        </div>
      </div>

      <div className="space-y-6 overflow-y-auto p-5">
        <section className="rounded-lg border border-border p-4">
          <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Notatki</h4>
          {task.notes ? (
            <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{task.notes}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Brak notatek dla tego zadania.</p>
          )}
        </section>

        <section className="rounded-lg border border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Podzadania</h4>
            <span className="text-xs text-muted-foreground">{completedSubtasks}/{subtasks.length}</span>
          </div>

          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${subtasks.length > 0 ? (completedSubtasks / subtasks.length) * 100 : 0}%` }}
            />
          </div>

          <div className="space-y-2">
            {subtasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak podzadań.</p>
            ) : (
              subtasks.map(subtask => (
                <div key={subtask.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5">
                  <input
                    type="checkbox"
                    checked={subtask.completed}
                    onChange={() => void handleToggleSubtask(subtask)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className={`flex-1 text-sm ${subtask.completed ? 'line-through text-muted-foreground' : 'text-gray-900 dark:text-white'}`}>
                    {subtask.title}
                  </span>
                  <button onClick={() => void handleDeleteSubtask(subtask.id)} className="text-xs font-medium text-destructive hover:underline">
                    Usuń
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newSubtask}
              onChange={event => setNewSubtask(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && void handleAddSubtask()}
              placeholder="Nowe podzadanie..."
              className="input flex-1"
            />
            <button onClick={() => void handleAddSubtask()} className="btn btn-secondary btn-sm">Dodaj</button>
          </div>
        </section>

        <section className="rounded-lg border border-border p-4">
          <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Komentarze</h4>
          <div className="space-y-2">
            {comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak komentarzy.</p>
            ) : (
              comments.map(comment => (
                <div key={comment.id} className="rounded-lg border border-border p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-900 dark:text-white">{comment.author}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(comment.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{comment.text}</p>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={event => setNewComment(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && void handleAddComment()}
              placeholder="Dodaj komentarz..."
              className="input flex-1"
            />
            <button onClick={() => void handleAddComment()} className="btn btn-secondary btn-sm">Wyślij</button>
          </div>
        </section>
      </div>

      <div className="border-t border-border bg-card p-4">
        <div className="flex justify-between gap-3">
          <button onClick={() => onComplete(task.id)} className={`btn btn-sm ${task.completed ? 'btn-secondary' : 'btn-primary'}`}>
            {task.completed ? 'Przywróć zadanie' : 'Oznacz jako zakończone'}
          </button>
          {user?.role === 'admin' && (
            <button onClick={() => onDelete(task.id)} className="btn btn-destructive btn-sm">Usuń zadanie</button>
          )}
        </div>
      </div>
    </div>
  )
}

function priorityLabel(priority: string) {
  return ({ high: 'Priorytet: wysoki', medium: 'Priorytet: średni', low: 'Priorytet: niski' }[priority] || priority)
}

function statusLabel(status: string) {
  return ({ todo: 'Status: do zrobienia', in_progress: 'Status: w toku', done: 'Status: zakończone' }[status] || status)
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pl-PL')
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{children}</span>
}
