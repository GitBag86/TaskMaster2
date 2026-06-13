import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Task } from '@/types'
import { isAdminRole } from '@/types'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'
import { useAuth } from '@/store/AuthContext'
import { useSocket } from '@/store/SocketContext'
import TaskCard from './TaskCard'
import TaskForm from './TaskForm'
import { TasksPageSkeleton } from '@/components/common/Skeletons'
import Modal from '@/components/common/Modal'
import { EmptyState } from '@/components/common/EmptyState'
import { isOverdue } from '@/utils/helpers'
import { useUrlFilters } from '@/utils/useUrlFilters'
import { canPartiallyUpdate } from '@/utils/taskEventHelpers'
import { useTasksQuery } from '@/hooks/useTasksQuery'

interface TaskFormData {
  title: string;
  assignee_ids?: number[];
  priority?: 'low' | 'medium' | 'high';
  project?: string;
  due_date?: string;
  notes?: string;
}

const PER_PAGE = 24

type BulkUpdates = {
  priority?: Task['priority'];
  project?: string;
  completed?: boolean;
  status?: Task['status'];
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const { filters, setFilter, resetFilters: resetUrlFilters, activeCount } = useUrlFilters({
    q: '',
    priority: '',
    project: '',
    status: '',
    page: '1',
  })

  const searchQuery = filters.q
  const filterPriority = filters.priority
  const filterProject = filters.project
  const filterStatus = filters.status
  const page = Number(filters.page)

  const [showCreate, setShowCreate] = useState(false)
  const [total, setTotal] = useState(0)
  const [isSearchMode, setIsSearchMode] = useState(false)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(() => new Set())
  const [bulkStatus, setBulkStatus] = useState<'' | Task['status']>('')
  const [bulkPriority, setBulkPriority] = useState<'' | Task['priority']>('')
  const [bulkProject, setBulkProject] = useState('')

  const navigate = useNavigate()
  const { addToast } = useToast()
  const { user } = useAuth()
  const { lastTaskEvent } = useSocket()

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const completedCount = tasks.filter(task => task.completed).length
  const pendingCount = Math.max(0, tasks.length - completedCount)
  const overdueCount = tasks.filter(task => task.due_date && isOverdue(task.due_date, task.completed)).length
  const blockedCount = tasks.filter(task => task.is_blocked && !task.completed).length

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

  // Use React Query for caching; seed local state for socket-driven partial updates
  const query = useTasksQuery(page, PER_PAGE)

  const fetchTasks = useCallback(async (targetPage: number) => {
    setLoading(true)
    try {
      const res = await api.tasks.getAll(targetPage, PER_PAGE)
      setTasks(res.tasks)
      setTotal(res.total)
      if (res.page !== targetPage) {
        setFilter('page', String(res.page))
      }
      setIsSearchMode(false)
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd ładowania zadań', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast, setFilter])

  // Seed local state from query cache on page change, then do manual fetch as fallback
  useEffect(() => {
    if (query.data) {
      setTasks(query.data.tasks)
      setTotal(query.data.total)
      setLoading(false)
    } else if (!query.isLoading) {
      void fetchTasks(page)
    }
  }, [query.data, query.isLoading, page, fetchTasks])

  useEffect(() => {
    if (page > totalPages && totalPages >= 1) {
      setFilter('page', String(totalPages))
    }
  }, [page, totalPages, setFilter])

  const handleTaskEvent = useCallback((event: typeof lastTaskEvent) => {
    if (!event || event.user === user?.username) return

    if (event.action === 'deleted' && event.task_id) {
      setTasks(prev => prev.filter(task => task.id !== event.task_id))
      setTotal(prev => Math.max(0, prev - 1))
      return
    }

    if (event.task && canPartiallyUpdate(event)) {
      replaceTask(event.task)
      if (event.action === 'created') {
        setTotal(prev => prev + 1)
      }
      return
    }

    if (event.task_ids && ['bulk_deleted', 'bulk_completed', 'bulk_updated'].includes(event.action)) {
      void fetchTasks(page)
    }
  }, [fetchTasks, page, replaceTask, user?.username])

  useEffect(() => {
    handleTaskEvent(lastTaskEvent)
  }, [handleTaskEvent, lastTaskEvent])

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setFilter('page', '1')
      void fetchTasks(1)
      return
    }

    try {
      const res = await api.tasks.search(searchQuery)
      setTasks(res.tasks)
      setTotal(res.tasks.length)
      setFilter('page', '1')
      setIsSearchMode(true)
    } catch {
      addToast('Błąd wyszukiwania', 'error')
    }
  }

  const clearFilters = () => {
    resetUrlFilters()
    setSelectedTaskIds(new Set())
    void fetchTasks(1)
  }

  const filteredTasks = useMemo(() => tasks.filter(t => {
    if (filterPriority && t.priority !== filterPriority) return false
    if (filterProject && t.project !== filterProject) return false
    if (filterStatus === 'completed' && !t.completed) return false
    if (filterStatus === 'pending' && t.completed) return false
    if (filterStatus === 'blocked' && (!t.is_blocked || t.completed)) return false
    return true
  }), [filterPriority, filterProject, filterStatus, tasks])

  const projects = useMemo(() => [...new Set(tasks.map(t => t.project))], [tasks])
  const visibleTaskIds = useMemo(() => filteredTasks.map(task => task.id), [filteredTasks])
  const allVisibleSelected = visibleTaskIds.length > 0 && visibleTaskIds.every(id => selectedTaskIds.has(id))

  useEffect(() => {
    const visibleIds = new Set(visibleTaskIds)
    setSelectedTaskIds(prev => {
      const next = new Set([...prev].filter(id => visibleIds.has(id)))
      const unchanged = next.size === prev.size && [...next].every(id => prev.has(id))
      return unchanged ? prev : next
    })
  }, [visibleTaskIds])

  const toggleTaskSelection = (taskId: number, selected: boolean) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev)
      if (selected) {
        next.add(taskId)
      } else {
        next.delete(taskId)
      }
      return next
    })
  }

  const toggleVisibleSelection = (selected: boolean) => {
    setSelectedTaskIds(selected ? new Set(visibleTaskIds) : new Set())
  }

  const handleDelete = async (id: number) => {
    try {
      await api.tasks.delete(id)
      setTasks(prev => prev.filter(task => task.id !== id))
      setSelectedTaskIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setTotal(prev => Math.max(0, prev - 1))
      if (selectedTask?.id === id) {
        setSelectedTask(null)
      }
      addToast('Zadanie usunięte', 'success')
    } catch {
      addToast('Błąd usuwania', 'error')
    }
  }

  const handleBulkComplete = async () => {
    const taskIds = [...selectedTaskIds]
    if (taskIds.length === 0) return

    try {
      await api.tasks.bulkComplete(taskIds)
      setTasks(prev => prev.map(task => (
        selectedTaskIds.has(task.id) ? { ...task, completed: true, status: 'done' } : task
      )))
      setSelectedTaskIds(new Set())
      addToast(`Zakończono ${taskIds.length} zadań`, 'success')
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd operacji masowej', 'error')
    }
  }

  const handleBulkUpdate = async (updates: BulkUpdates) => {
    const taskIds = [...selectedTaskIds]
    if (taskIds.length === 0) return

    try {
      await api.tasks.bulkUpdate(taskIds, updates)
      await fetchTasks(page)
      setSelectedTaskIds(new Set())
      addToast(`Zaktualizowano ${taskIds.length} zadań`, 'success')
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd operacji masowej', 'error')
    }
  }

  const handleBulkDelete = async () => {
    const taskIds = [...selectedTaskIds]
    if (taskIds.length === 0) return
    if (!window.confirm(`Usunąć ${taskIds.length} zaznaczonych zadań?`)) return

    try {
      await api.tasks.bulkDelete(taskIds)
      setTasks(prev => prev.filter(task => !selectedTaskIds.has(task.id)))
      setTotal(prev => Math.max(0, prev - taskIds.length))
      setSelectedTaskIds(new Set())
      addToast(`Usunięto ${taskIds.length} zadań`, 'success')
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd usuwania masowego', 'error')
    }
  }

  const applyBulkStatus = () => {
    if (!bulkStatus) return
    void handleBulkUpdate({ status: bulkStatus, completed: bulkStatus === 'done' })
    setBulkStatus('')
  }

  const applyBulkPriority = () => {
    if (!bulkPriority) return
    void handleBulkUpdate({ priority: bulkPriority })
    setBulkPriority('')
  }

  const applyBulkProject = () => {
    const project = bulkProject.trim()
    if (!project) return
    void handleBulkUpdate({ project })
    setBulkProject('')
  }

  const handleComplete = async (id: number) => {
    try {
      const updatedTask = await api.tasks.complete(id)
      replaceTask(updatedTask)
      await fetchTasks(page)
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd zmiany stanu', 'error')
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
      throw err
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
        {isAdminRole(user?.role) && (
          <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm">
            <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nowe zadanie
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="card p-3">
          <p className="text-xs text-muted-foreground">Zablokowane</p>
          <p className="mt-1 text-xl font-semibold text-amber-600 dark:text-amber-400">{blockedCount}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>                        <input
                          id="task-search-input"
                          type="text"
                          placeholder="Szukaj zadań..."
                          value={searchQuery}
                          onChange={e => setFilter('q', e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && void handleSearch()}
                          className="input pl-10"
                        />
        </div>                        <select value={filterPriority} onChange={e => setFilter('priority', e.target.value)} className="input sm:w-40">
          <option value="">Priorytet</option>
          <option value="high">Wysoki</option>
          <option value="medium">Średni</option>
          <option value="low">Niski</option>
        </select>                        <select value={filterProject} onChange={e => setFilter('project', e.target.value)} className="input sm:w-40">
          <option value="">Projekt</option>
          {projects.map(p => <option key={p} value={p}>{p}</option>)}
        </select>                        <select value={filterStatus} onChange={e => setFilter('status', e.target.value)} className="input sm:w-40">
          <option value="">Status</option>
          <option value="pending">Oczekujące</option>
          <option value="blocked">Zablokowane</option>
          <option value="completed">Zakończone</option>
        </select>
        <button onClick={() => void handleSearch()} className="btn btn-secondary btn-sm">Szukaj</button>
        <button onClick={clearFilters} className="btn btn-ghost btn-sm">
          {activeCount > 0 && (
            <span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary">{activeCount}</span>
          )}
          Wyczyść
        </button>
      </div>

      {isAdminRole(user?.role) && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={event => toggleVisibleSelection(event.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/50"
              />
              Widoczne
            </label>
            <span className="text-sm text-muted-foreground">{selectedTaskIds.size} zaznaczone</span>
            <button
              onClick={() => void handleBulkComplete()}
              disabled={selectedTaskIds.size === 0}
              className="btn btn-secondary btn-sm"
            >
              <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Ukończ
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
            <div className="flex gap-2">
              <select
                value={bulkStatus}
                onChange={event => setBulkStatus(event.target.value as '' | Task['status'])}
                disabled={selectedTaskIds.size === 0}
                className="input sm:w-36"
              >
                <option value="">Status</option>
                <option value="todo">Do zrobienia</option>
                <option value="in_progress">W toku</option>
                <option value="done">Zakończone</option>
              </select>
              <button onClick={applyBulkStatus} disabled={!bulkStatus || selectedTaskIds.size === 0} className="btn btn-secondary btn-sm">
                Zmień
              </button>
            </div>

            <div className="flex gap-2">
              <select
                value={bulkPriority}
                onChange={event => setBulkPriority(event.target.value as '' | Task['priority'])}
                disabled={selectedTaskIds.size === 0}
                className="input sm:w-32"
              >
                <option value="">Priorytet</option>
                <option value="high">Wysoki</option>
                <option value="medium">Średni</option>
                <option value="low">Niski</option>
              </select>
              <button onClick={applyBulkPriority} disabled={!bulkPriority || selectedTaskIds.size === 0} className="btn btn-secondary btn-sm">
                Ustaw
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={bulkProject}
                onChange={event => setBulkProject(event.target.value)}
                disabled={selectedTaskIds.size === 0}
                placeholder="Projekt"
                className="input sm:w-36"
              />
              <button onClick={applyBulkProject} disabled={!bulkProject.trim() || selectedTaskIds.size === 0} className="btn btn-secondary btn-sm">
                Przenieś
              </button>
            </div>

            <button
              onClick={() => void handleBulkDelete()}
              disabled={selectedTaskIds.size === 0}
              className="btn btn-destructive btn-sm"
            >
              <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0 1 12a2 2 0 002 2h4a2 2 0 002-2l1-12" />
              </svg>
              Usuń
            </button>
          </div>
        </div>
      )}

      {filteredTasks.length === 0 ? (
        <EmptyState
          type="tasks"
          title="Brak zadań"
          description={isAdminRole(user?.role) ? 'Kliknij "Nowe zadanie" aby utworzyć' : 'Nie masz przypisanych zadań'}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => navigate(`/tasks/${task.id}`)}
              onComplete={() => void handleComplete(task.id)}
              selectable={isAdminRole(user?.role)}
              selected={selectedTaskIds.has(task.id)}
              onSelectionChange={selected => toggleTaskSelection(task.id, selected)}
            />
          ))}
        </div>
      )}

      {!isSearchMode && (
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <span className="text-sm text-muted-foreground">Strona {page} z {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('page', String(Math.max(1, page - 1)))}
              disabled={page <= 1}
              className="btn btn-secondary btn-sm disabled:opacity-50"
            >
              Poprzednia
            </button>
            <button
              onClick={() => setFilter('page', String(Math.min(totalPages, page + 1)))}
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


    </div>
  )
}
