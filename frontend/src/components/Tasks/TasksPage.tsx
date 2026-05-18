import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { Task } from '@/types'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'
import { useAuth } from '@/store/AuthContext'
import { useSocket } from '@/store/SocketContext'
import TaskCard from './TaskCard'
import TaskForm from './TaskForm'
import TaskDetail from './TaskDetail'
import { TasksPageSkeleton } from '@/components/common/Skeletons'

interface TaskFormData {
  title: string;
  assignee_ids?: number[];
  priority?: 'low' | 'medium' | 'high';
  project?: string;
  due_date?: string;
  notes?: string;
}

const PER_PAGE = 24

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [isSearchMode, setIsSearchMode] = useState(false)

  const { addToast } = useToast()
  const { user } = useAuth()
  const { lastTaskEvent } = useSocket()

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const completedCount = tasks.filter(task => task.completed).length
  const pendingCount = Math.max(0, tasks.length - completedCount)
  const overdueCount = tasks.filter(task => isOverdue(task)).length

  const replaceTask = useCallback((updatedTask: Task) => {
    setTasks(prev => {
      const existingIndex = prev.findIndex(task => task.id === updatedTask.id)
      if (existingIndex === -1) {
        return page === 1 ? [updatedTask, ...prev].slice(0, PER_PAGE) : prev
      }
      const next = [...prev]
      next[existingIndex] = updatedTask
      return next
    })
  }, [page])

  const fetchTasks = useCallback(async (targetPage: number) => {
    try {
      setLoading(true)
      const res = await api.tasks.getAll(targetPage, PER_PAGE)
      setTasks(res.tasks)
      setTotal(res.total)
      if (res.page !== targetPage) {
        setPage(res.page)
      }
      setIsSearchMode(false)
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd ładowania zadań', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void fetchTasks(page)
  }, [fetchTasks, page])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  useEffect(() => {
    if (!selectedTask) return
    const syncedTask = tasks.find(task => task.id === selectedTask.id)
    if (!syncedTask && !loading) {
      setSelectedTask(null)
      return
    }
    if (syncedTask && syncedTask !== selectedTask) {
      setSelectedTask(syncedTask)
    }
  }, [loading, selectedTask, tasks])

  useEffect(() => {
    if (!lastTaskEvent || lastTaskEvent.user === user?.username) return

    if (lastTaskEvent.action === 'deleted' && lastTaskEvent.task_id) {
      setTasks(prev => prev.filter(task => task.id !== lastTaskEvent.task_id))
      setTotal(prev => Math.max(0, prev - 1))
      return
    }

    if (lastTaskEvent.task && ['created', 'updated', 'completed', 'reopened', 'commented', 'subtask_created', 'subtask_completed', 'subtask_reopened', 'subtask_deleted'].includes(lastTaskEvent.action)) {
      replaceTask(lastTaskEvent.task)
      if (lastTaskEvent.action === 'created') {
        setTotal(prev => prev + 1)
      }
      return
    }

    if (lastTaskEvent.task_ids && ['bulk_deleted', 'bulk_completed', 'bulk_updated'].includes(lastTaskEvent.action)) {
      void fetchTasks(page)
    }
  }, [fetchTasks, lastTaskEvent, page, replaceTask, user?.username])

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setPage(1)
      void fetchTasks(1)
      return
    }

    try {
      const res = await api.tasks.search(searchQuery)
      setTasks(res.tasks)
      setTotal(res.tasks.length)
      setPage(1)
      setIsSearchMode(true)
    } catch {
      addToast('Błąd wyszukiwania', 'error')
    }
  }

  const clearFilters = () => {
    setFilterPriority('')
    setFilterProject('')
    setFilterStatus('')
    setSearchQuery('')
    setPage(1)
    void fetchTasks(1)
  }

  const filteredTasks = tasks.filter(t => {
    if (filterPriority && t.priority !== filterPriority) return false
    if (filterProject && t.project !== filterProject) return false
    if (filterStatus === 'completed' && !t.completed) return false
    if (filterStatus === 'pending' && t.completed) return false
    return true
  })

  const projects = [...new Set(tasks.map(t => t.project))]

  const handleDelete = async (id: number) => {
    try {
      await api.tasks.delete(id)
      setTasks(prev => prev.filter(task => task.id !== id))
      setTotal(prev => Math.max(0, prev - 1))
      if (selectedTask?.id === id) {
        setSelectedTask(null)
      }
      addToast('Zadanie usunięte', 'success')
    } catch {
      addToast('Błąd usuwania', 'error')
    }
  }

  const handleComplete = async (id: number) => {
    try {
      const updatedTask = await api.tasks.complete(id)
      replaceTask(updatedTask)
    } catch {
      addToast('Błąd zmiany stanu', 'error')
    }
  }

  const handleCreate = async (data: TaskFormData) => {
    try {
      const createdTask = await api.tasks.create(data)
      setShowCreate(false)
      setTotal(prev => prev + 1)
      if (!isSearchMode && page === 1) {
        setTasks(prev => [createdTask, ...prev].slice(0, PER_PAGE))
      }
      addToast('Zadanie utworzone', 'success')
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd tworzenia', 'error')
    }
  }

  if (loading) {
    return <TasksPageSkeleton />
  }

  return (
    <div className="space-y-6 page-enter">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Zadania</h2>
          <p className="text-sm text-muted-foreground">
            {isSearchMode ? `Wyniki wyszukiwania: ${total}` : `Wszystkie zadania: ${total}`}
          </p>
        </div>
        {user?.role === 'admin' && (
          <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm">
            <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nowe zadanie
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-3">
          <p className="text-xs text-muted-foreground">Na tej stronie</p>
          <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{tasks.length}</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-muted-foreground">Do zrobienia</p>
          <p className="mt-1 text-xl font-semibold text-amber-600 dark:text-amber-400">{pendingCount}</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-muted-foreground">Po terminie</p>
          <p className="mt-1 text-xl font-semibold text-destructive">{overdueCount}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Szukaj zadań..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void handleSearch()}
            className="input pl-10"
          />
        </div>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="input sm:w-40">
          <option value="">Priorytet</option>
          <option value="high">Wysoki</option>
          <option value="medium">Średni</option>
          <option value="low">Niski</option>
        </select>
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="input sm:w-40">
          <option value="">Projekt</option>
          {projects.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input sm:w-40">
          <option value="">Status</option>
          <option value="pending">Oczekujące</option>
          <option value="completed">Zakończone</option>
        </select>
        <button onClick={() => void handleSearch()} className="btn btn-secondary btn-sm">Szukaj</button>
        <button onClick={clearFilters} className="btn btn-ghost btn-sm">Wyczyść</button>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <svg className="mb-4 h-12 w-12 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-lg font-medium text-gray-500 dark:text-gray-400">Brak zadań</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {user?.role === 'admin' ? 'Kliknij "Nowe zadanie" aby utworzyć' : 'Nie masz przypisanych zadań'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => setSelectedTask(task)}
              onComplete={() => void handleComplete(task.id)}
            />
          ))}
        </div>
      )}

      {!isSearchMode && (
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <span className="text-sm text-muted-foreground">Strona {page} z {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="btn btn-secondary btn-sm disabled:opacity-50"
            >
              Poprzednia
            </button>
            <button
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="btn btn-secondary btn-sm disabled:opacity-50"
            >
              Następna
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <Modal onClose={() => setShowCreate(false)}>
          <TaskForm
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {selectedTask && (
        <Modal onClose={() => setSelectedTask(null)}>
          <TaskDetail
            task={selectedTask}
            onDelete={id => void handleDelete(id)}
            onComplete={id => void handleComplete(id)}
            onUpdate={updatedTask => {
              replaceTask(updatedTask)
              setSelectedTask(updatedTask)
            }}
            onClose={() => setSelectedTask(null)}
          />
        </Modal>
      )}
    </div>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-gray-900"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

function isOverdue(task: Task) {
  if (task.completed || !task.due_date) return false
  return new Date(task.due_date) < new Date(new Date().toDateString())
}
