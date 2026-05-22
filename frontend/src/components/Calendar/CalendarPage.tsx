import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { Task } from '@/types'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'
import { useSocket } from '@/store/SocketContext'
import { useAuth } from '@/store/AuthContext'
import { CalendarSkeleton } from '@/components/common/Skeletons'
import TaskDetail from '@/components/Tasks/TaskDetail'
import TaskForm from '@/components/Tasks/TaskForm'
import { getPolishCalendarInfo } from '@/data/polishCalendar'

const days = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']
const months = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień']

type CalendarDay = {
  day: number;
  weekday: number;
}

type CalendarWeek = {
  weekNumber: number;
  days: Array<CalendarDay | null>;
}

type TaskFormData = {
  title: string;
  assignee_ids?: number[];
  priority?: Task['priority'];
  project?: string;
  due_date?: string;
  notes?: string;
}

export default function CalendarPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [priorityFilter, setPriorityFilter] = useState<'' | Task['priority']>('')
  const [projectFilter, setProjectFilter] = useState('')
  const [hideCompleted, setHideCompleted] = useState(false)
  const [onlyMine, setOnlyMine] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { addToast } = useToast()
  const { lastTaskEvent } = useSocket()
  const { user } = useAuth()

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

    if (lastTaskEvent.task && ['created', 'updated', 'completed', 'reopened', 'commented', 'mentioned', 'subtask_created', 'subtask_completed', 'subtask_reopened', 'subtask_deleted'].includes(lastTaskEvent.action)) {
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

  const calendarWeeks = useMemo(() => {
    const weeks: CalendarWeek[] = []
    let currentWeek: Array<CalendarDay | null> = Array.from({ length: startDay }, () => null)

    for (let day = 1; day <= daysInMonth; day += 1) {
      const weekday = (new Date(year, month, day).getDay() + 6) % 7
      currentWeek.push({ day, weekday })

      if (currentWeek.length === 7) {
        weeks.push({
          weekNumber: getIsoWeekNumber(new Date(year, month, day)),
          days: currentWeek,
        })
        currentWeek = []
      }
    }

    if (currentWeek.length > 0) {
      const lastMonthDay = [...currentWeek].reverse().find(day => day !== null)?.day ?? daysInMonth
      weeks.push({
        weekNumber: getIsoWeekNumber(new Date(year, month, lastMonthDay)),
        days: [...currentWeek, ...Array.from({ length: 7 - currentWeek.length }, () => null)],
      })
    }

    return weeks
  }, [daysInMonth, month, startDay, year])

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

  const selectedDate = selectedDay === null
    ? ''
    : `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`

  const projects = useMemo(() => [...new Set(tasks.map(task => task.project))].sort(), [tasks])

  const filteredTasks = useMemo(() => tasks.filter(task => {
    if (priorityFilter && task.priority !== priorityFilter) return false
    if (projectFilter && task.project !== projectFilter) return false
    if (hideCompleted && task.completed) return false
    if (onlyMine && user && !task.assignees.some(assignee => assignee.id === user.id)) return false
    return true
  }), [hideCompleted, onlyMine, priorityFilter, projectFilter, tasks, user])

  const getDayTasks = useCallback((day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return filteredTasks.filter(task => task.due_date === dateStr)
  }, [filteredTasks, month, year])

  const selectedTasks = useMemo(() => {
    if (selectedDay === null) return []
    return getDayTasks(selectedDay).sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 }
      return rank[a.priority] - rank[b.priority]
    })
  }, [getDayTasks, selectedDay])

  const selectedCalendarInfo = useMemo(() => {
    if (selectedDay === null) return null
    return getPolishCalendarInfo(new Date(year, month, selectedDay))
  }, [month, selectedDay, year])

  const monthTasksCount = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
    return filteredTasks.filter(task => task.due_date?.startsWith(prefix)).length
  }, [filteredTasks, month, year])

  const monthHolidayCount = useMemo(() => {
    let total = 0
    for (let day = 1; day <= daysInMonth; day += 1) {
      total += getPolishCalendarInfo(new Date(year, month, day)).holidays.length
    }
    return total
  }, [daysInMonth, month, year])

  const overdueCount = useMemo(
    () => filteredTasks.filter(task => task.due_date && !task.completed && new Date(task.due_date) < new Date(new Date().toDateString())).length,
    [filteredTasks],
  )

  useEffect(() => {
    if (!selectedTask) return
    const syncedTask = tasks.find(task => task.id === selectedTask.id)
    if (!syncedTask) {
      setSelectedTask(null)
      return
    }
    if (syncedTask !== selectedTask) {
      setSelectedTask(syncedTask)
    }
  }, [selectedTask, tasks])

  const toggleTaskComplete = async (taskId: number) => {
    try {
      const updatedTask = await api.tasks.complete(taskId)
      setTasks(prev => prev.map(task => (task.id === taskId ? updatedTask : task)))
      addToast(updatedTask.completed ? 'Zadanie zakończone' : 'Zadanie przywrócone', 'success')
    } catch {
      addToast('Błąd aktualizacji zadania', 'error')
    }
  }

  const createTask = async (data: TaskFormData) => {
    try {
      const createdTask = await api.tasks.create(data)
      setTasks(prev => [createdTask, ...prev])
      setShowCreate(false)
      addToast('Zadanie utworzone', 'success')
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd tworzenia zadania', 'error')
    }
  }

  const updateTask = (updatedTask: Task) => {
    setTasks(prev => prev.map(task => (task.id === updatedTask.id ? updatedTask : task)))
    setSelectedTask(updatedTask)
  }

  const deleteTask = async (taskId: number) => {
    try {
      await api.tasks.delete(taskId)
      setTasks(prev => prev.filter(task => task.id !== taskId))
      setSelectedTask(null)
      addToast('Zadanie usunięte', 'success')
    } catch {
      addToast('Błąd usuwania zadania', 'error')
    }
  }

  const clearFilters = () => {
    setPriorityFilter('')
    setProjectFilter('')
    setHideCompleted(false)
    setOnlyMine(false)
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
        <Legend label="Święto" className="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" />
        <Legend label="Imieniny" className="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" />
        <Legend label={`Terminów w miesiącu: ${monthTasksCount}`} className="bg-primary/10 text-primary" />
        <Legend label={`Świąt w miesiącu: ${monthHolidayCount}`} className="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" />
        <Legend label={`Po terminie: ${overdueCount}`} className="bg-destructive/10 text-destructive" />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <select
            value={priorityFilter}
            onChange={event => setPriorityFilter(event.target.value as '' | Task['priority'])}
            className="input sm:w-40"
          >
            <option value="">Priorytet</option>
            <option value="high">Wysoki</option>
            <option value="medium">Średni</option>
            <option value="low">Niski</option>
          </select>
          <select value={projectFilter} onChange={event => setProjectFilter(event.target.value)} className="input sm:w-44">
            <option value="">Projekt</option>
            {projects.map(project => <option key={project} value={project}>{project}</option>)}
          </select>
          <label className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={hideCompleted}
              onChange={event => setHideCompleted(event.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/50"
            />
            Ukryj zakończone
          </label>
          <label className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={event => setOnlyMine(event.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/50"
            />
            Tylko moje
          </label>
        </div>

        <div className="flex gap-2">
          <button onClick={clearFilters} className="btn btn-ghost btn-sm">Wyczyść</button>
          {user?.role === 'admin' && (
            <button
              onClick={() => setShowCreate(true)}
              disabled={selectedDay === null}
              className="btn btn-primary btn-sm"
            >
              <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Dodaj na dzień
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card overflow-hidden">
          <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b border-border bg-muted/40">
            <div className="border-r border-border py-2 text-center text-[11px] font-semibold uppercase text-muted-foreground">Tydz.</div>
            {days.map((day, index) => (
              <div key={day} className={`py-2 text-center text-xs font-semibold ${weekdayHeaderClass(index)}`}>{day}</div>
            ))}
          </div>

          <div>
            {calendarWeeks.map(week => (
              <div key={`${year}-${month}-${week.weekNumber}`} className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))]">
                <div className="flex min-h-[92px] items-start justify-center border-b border-r border-border bg-muted/30 px-1 py-2 text-[11px] font-semibold text-muted-foreground">
                  {week.weekNumber}
                </div>

                {week.days.map((calendarDay, index) => {
                  if (!calendarDay) {
                    return (
                      <div
                        key={`empty-${week.weekNumber}-${index}`}
                        className={`min-h-[92px] border-b border-r border-border ${emptyDayClass(index)}`}
                      />
                    )
                  }

                  const dayTasks = getDayTasks(calendarDay.day)
                  const isToday = calendarDay.day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
                  const isSelected = selectedDay === calendarDay.day
                  const calendarInfo = getPolishCalendarInfo(new Date(year, month, calendarDay.day))

                  return (
                    <div
                      key={calendarDay.day}
                      onClick={() => setSelectedDay(calendarDay.day)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedDay(calendarDay.day)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className={`min-h-[92px] border-b border-r border-border p-1.5 text-left transition-colors ${dayCellClass(calendarDay.weekday, isToday, isSelected)}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${dayNumberClass(calendarDay.weekday, isToday)}`}>
                          {calendarDay.day}
                        </span>
                        <div className="flex min-w-0 flex-col items-end gap-1">
                          {calendarInfo.holidays.length > 0 && (
                            <span
                              className="max-w-full truncate rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                              title={calendarInfo.holidays.join(', ')}
                            >
                              Święto
                            </span>
                          )}
                          {calendarInfo.nameDays.length > 0 && (
                            <span
                              className="max-w-[5.5rem] truncate rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                              title={`Imieniny: ${calendarInfo.nameDays.join(', ')}`}
                            >
                              {calendarInfo.nameDays.slice(0, 2).join(', ')}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-1 space-y-1">
                        {dayTasks.slice(0, 2).map(task => (
                          <button
                            key={task.id}
                            type="button"
                            onClick={event => {
                              event.stopPropagation()
                              setSelectedDay(calendarDay.day)
                              setSelectedTask(task)
                            }}
                            className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium ${taskBadgeClass(task)}`}
                            title={task.title}
                          >
                            {task.title}
                          </button>
                        ))}
                        {dayTasks.length > 2 && (
                          <div className="text-[10px] text-muted-foreground">+{dayTasks.length - 2} więcej</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <aside className="card p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
                {selectedDay ? `Plan dnia: ${selectedDay} ${months[month].toLowerCase()}` : 'Wybierz dzień'}
              </h3>
              <p className="text-xs text-muted-foreground">Kliknij zadanie, aby otworzyć szczegóły.</p>
            </div>
            {user?.role === 'admin' && selectedDay !== null && (
              <button onClick={() => setShowCreate(true)} className="btn btn-secondary btn-sm">Dodaj</button>
            )}
          </div>

          {selectedCalendarInfo && (
            <div className="mb-3 space-y-2">
              {selectedCalendarInfo.holidays.length > 0 && (
                <CalendarInfoBox
                  label="Święta"
                  value={selectedCalendarInfo.holidays.join(', ')}
                  className="border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200"
                />
              )}
              {selectedCalendarInfo.nameDays.length > 0 && (
                <CalendarInfoBox
                  label="Imieniny"
                  value={selectedCalendarInfo.nameDays.join(', ')}
                  className="border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200"
                />
              )}
            </div>
          )}

          <div className="space-y-2">
            {selectedDay === null || selectedTasks.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                Brak zadań dla wybranego dnia.
              </p>
            ) : (
              selectedTasks.map(task => (
                <div key={task.id} className="rounded-lg border border-border p-3 transition-colors hover:bg-muted/30">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <button
                      onClick={() => setSelectedTask(task)}
                      className={`min-w-0 flex-1 text-left text-sm font-semibold hover:text-primary ${task.completed ? 'line-through text-muted-foreground' : 'text-gray-900 dark:text-white'}`}
                    >
                      {task.title}
                    </button>
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

      {showCreate && (
        <Modal onClose={() => setShowCreate(false)}>
          <TaskForm
            initialData={{ title: '', due_date: selectedDate, priority: 'medium', project: '', notes: '', assignee_ids: [] }}
            heading="Nowe zadanie"
            submitLabel="Utwórz"
            onSubmit={data => void createTask(data)}
            onCancel={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {selectedTask && (
        <Modal onClose={() => setSelectedTask(null)}>
          <TaskDetail
            task={selectedTask}
            onDelete={id => void deleteTask(id)}
            onComplete={id => void toggleTaskComplete(id)}
            onUpdate={updateTask}
            onClose={() => setSelectedTask(null)}
          />
        </Modal>
      )}
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

function getIsoWeekNumber(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNumber = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

function weekdayHeaderClass(weekday: number) {
  if (weekday === 5) return 'bg-amber-100/80 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
  if (weekday === 6) return 'bg-red-100/80 text-red-700 dark:bg-red-900/20 dark:text-red-300'
  return 'text-muted-foreground'
}

function emptyDayClass(weekday: number) {
  if (weekday === 5) return 'bg-amber-50/40 dark:bg-amber-950/10'
  if (weekday === 6) return 'bg-red-50/40 dark:bg-red-950/10'
  return 'bg-gray-50/50 dark:bg-gray-900/30'
}

function dayCellClass(weekday: number, isToday: boolean, isSelected: boolean) {
  if (isSelected) return 'bg-primary/10 ring-1 ring-inset ring-primary/30'
  if (isToday) return 'bg-primary/5 hover:bg-primary/10'
  if (weekday === 5) return 'bg-amber-50/70 hover:bg-amber-100/80 dark:bg-amber-950/20 dark:hover:bg-amber-900/30'
  if (weekday === 6) return 'bg-red-50/70 hover:bg-red-100/80 dark:bg-red-950/20 dark:hover:bg-red-900/30'
  return 'hover:bg-muted/40'
}

function dayNumberClass(weekday: number, isToday: boolean) {
  if (isToday) return 'bg-primary text-white'
  if (weekday === 5) return 'text-amber-700 dark:text-amber-300'
  if (weekday === 6) return 'text-red-700 dark:text-red-300'
  return 'text-gray-700 dark:text-gray-300'
}

function Legend({ label, className }: { label: string; className: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${className}`}>{label}</span>
}

function CalendarInfoBox({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
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
        onClick={event => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
