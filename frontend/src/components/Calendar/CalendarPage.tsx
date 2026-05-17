import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Task } from '@/types'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'
import { useSocket } from '@/store/SocketContext'
import { CalendarSkeleton } from '@/components/common/Skeletons'

const days = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']
const months = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień']

export default function CalendarPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const { addToast } = useToast()
  const { lastTaskEvent } = useSocket()

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const today = new Date()

  const fetchTasks = useCallback(async () => {
    try {
      const response = await api.tasks.getAll(1, 300)
      setTasks(response.tasks)
    } catch {
      addToast('Błąd ładowania zadań', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void fetchTasks()
  }, [fetchTasks])

  useEffect(() => {
    if (!lastTaskEvent) return

    if (lastTaskEvent.task && ['created', 'updated', 'completed', 'reopened', 'commented', 'subtask_created', 'subtask_completed', 'subtask_reopened', 'subtask_deleted'].includes(lastTaskEvent.action)) {
      const updatedTask = lastTaskEvent.task
      setTasks(prev => {
        const index = prev.findIndex(task => task.id === lastTaskEvent.task_id)
        if (index === -1) return [updatedTask, ...prev]
        const next = [...prev]
        next[index] = updatedTask
        return next
      })
      return
    }

    if (lastTaskEvent.action === 'deleted' && lastTaskEvent.task_id) {
      setTasks(prev => prev.filter(task => task.id !== lastTaskEvent.task_id))
      return
    }

    if (lastTaskEvent.task_ids && ['bulk_deleted', 'bulk_completed', 'bulk_updated'].includes(lastTaskEvent.action)) {
      void fetchTasks()
    }
  }, [fetchTasks, lastTaskEvent])

  useEffect(() => {
    if (selectedDay === null) {
      const isCurrentMonth = month === today.getMonth() && year === today.getFullYear()
      if (isCurrentMonth) {
        setSelectedDay(today.getDate())
      }
    }
  }, [month, selectedDay, today, year])

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startDay = (firstDay.getDay() + 6) % 7

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
    setSelectedDay(null)
  }

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
    setSelectedDay(null)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
    setSelectedDay(new Date().getDate())
  }

  const getDayTasks = useCallback((day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return tasks.filter(task => task.due_date === dateStr)
  }, [month, tasks, year])

  const selectedTasks = useMemo(() => {
    if (selectedDay === null) return []
    return getDayTasks(selectedDay).sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 }
      return rank[a.priority] - rank[b.priority]
    })
  }, [getDayTasks, selectedDay])

  const monthTasksCount = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
    return tasks.filter(task => task.due_date?.startsWith(prefix)).length
  }, [month, tasks, year])

  const overdueCount = useMemo(
    () => tasks.filter(task => task.due_date && !task.completed && new Date(task.due_date) < new Date(new Date().toDateString())).length,
    [tasks],
  )

  const toggleTaskComplete = async (taskId: number) => {
    try {
      const updatedTask = await api.tasks.complete(taskId)
      setTasks(prev => prev.map(task => (task.id === taskId ? updatedTask : task)))
      addToast(updatedTask.completed ? 'Zadanie zakończone' : 'Zadanie przywrócone', 'success')
    } catch {
      addToast('Błąd aktualizacji zadania', 'error')
    }
  }

  if (loading) {
    return <CalendarSkeleton />
  }

  return (
    <div className="space-y-5 page-enter">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Kalendarz</h2>
          <p className="text-sm text-muted-foreground">Widok terminów z szybkim podglądem dnia i akcjami.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToToday} className="btn btn-ghost btn-sm">Dzisiaj</button>
          <button onClick={prevMonth} className="btn btn-secondary btn-sm">←</button>
          <span className="min-w-[150px] text-center font-medium text-gray-900 dark:text-white">{months[month]} {year}</span>
          <button onClick={nextMonth} className="btn btn-secondary btn-sm">→</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Legend label="Wysoki" className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" />
        <Legend label="Średni" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" />
        <Legend label="Niski" className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" />
        <Legend label="Zakończone" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" />
        <Legend label={`Terminów w miesiącu: ${monthTasksCount}`} className="bg-primary/10 text-primary" />
        <Legend label={`Po terminie: ${overdueCount}`} className="bg-destructive/10 text-destructive" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border bg-muted/40">
            {days.map(day => (
              <div key={day} className="py-2 text-center text-xs font-semibold text-muted-foreground">{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {Array.from({ length: startDay }).map((_, index) => (
              <div key={`empty-${index}`} className="min-h-[92px] border-b border-r border-border bg-gray-50/50 dark:bg-gray-900/30" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, index) => {
              const day = index + 1
              const dayTasks = getDayTasks(day)
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
              const isSelected = selectedDay === day

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`min-h-[92px] border-b border-r border-border p-1.5 text-left transition-colors ${
                    isSelected ? 'bg-primary/10' : isToday ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/40'
                  }`}
                >
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    isToday ? 'bg-primary text-white' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {day}
                  </span>

                  <div className="mt-1 space-y-1">
                    {dayTasks.slice(0, 2).map(task => (
                      <div key={task.id} className={`truncate rounded px-1.5 py-0.5 text-[10px] font-medium ${taskBadgeClass(task)}`}>
                        {task.title}
                      </div>
                    ))}
                    {dayTasks.length > 2 && (
                      <div className="text-[10px] text-muted-foreground">+{dayTasks.length - 2} więcej</div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <aside className="card p-4">
          <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
            {selectedDay ? `Plan dnia: ${selectedDay} ${months[month].toLowerCase()}` : 'Wybierz dzień'}
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">Kliknij dzień w kalendarzu, aby zarządzać zadaniami.</p>

          <div className="space-y-2">
            {selectedDay === null || selectedTasks.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                Brak zadań dla wybranego dnia.
              </p>
            ) : (
              selectedTasks.map(task => (
                <div key={task.id} className="rounded-lg border border-border p-3">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <p className={`text-sm font-semibold ${task.completed ? 'line-through text-muted-foreground' : 'text-gray-900 dark:text-white'}`}>
                      {task.title}
                    </p>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${priorityClass(task.priority)}`}>
                      {priorityLabel(task.priority)}
                    </span>
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">{task.project}</p>
                  <button
                    onClick={() => void toggleTaskComplete(task.id)}
                    className={`btn btn-sm w-full ${task.completed ? 'btn-secondary' : 'btn-primary'}`}
                  >
                    {task.completed ? 'Przywróć' : 'Oznacz jako zakończone'}
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function taskBadgeClass(task: Task) {
  if (task.completed) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  if (task.priority === 'high') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  if (task.priority === 'medium') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function priorityLabel(priority: Task['priority']) {
  return priority === 'high' ? 'Wysoki' : priority === 'medium' ? 'Średni' : 'Niski'
}

function priorityClass(priority: Task['priority']) {
  if (priority === 'high') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  if (priority === 'medium') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function Legend({ label, className }: { label: string; className: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${className}`}>{label}</span>
}
