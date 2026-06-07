import { useState, useEffect, useCallback, useMemo } from "react"
import type { Task } from "@/types"
import { isAdminRole } from "@/types"
import { api } from "@/api/client"
import { useToast } from "@/store/ToastContext"
import { useSocket } from "@/store/SocketContext"
import { useAuth } from "@/store/AuthContext"
import { CalendarSkeleton } from "@/components/common/Skeletons"
import Modal from "@/components/common/Modal"
import TaskDetail from "@/components/Tasks/TaskDetail"
import TaskForm from "@/components/Tasks/TaskForm"
import { getPolishCalendarInfo } from "@/data/polishCalendar"
import { priorityLabel, priorityClass } from "@/utils/helpers"
import { canPartiallyUpdate, replaceTaskInList } from "@/utils/taskEventHelpers"
import CalendarGrid, { buildCalendarWeeks } from "./CalendarGrid"

const months = [
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
]

type TaskFormData = {
  title: string
  assignee_ids?: number[]
  priority?: Task["priority"]
  project?: string
  due_date?: string
  notes?: string
}

export default function CalendarPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [priorityFilter, setPriorityFilter] = useState<"" | Task["priority"]>("")
  const [projectFilter, setProjectFilter] = useState("")
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
      addToast("Błąd ładowania zadań", "error")
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void fetchTasks()
  }, [fetchTasks])

  useEffect(() => {
    if (!lastTaskEvent) return

    if (lastTaskEvent.task && canPartiallyUpdate(lastTaskEvent)) {
      setTasks(prev => {
        const index = prev.findIndex(t => t.id === lastTaskEvent.task!.id)
        if (index === -1) return [lastTaskEvent.task!, ...prev]
        return replaceTaskInList(prev, lastTaskEvent.task!)
      })
      return
    }

    if (lastTaskEvent.action === "deleted" && lastTaskEvent.task_id) {
      setTasks(prev => prev.filter(task => task.id !== lastTaskEvent.task_id))
      return
    }

    if (
      lastTaskEvent.task_ids &&
      ["bulk_deleted", "bulk_completed", "bulk_updated"].includes(lastTaskEvent.action)
    ) {
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

  const calendarWeeks = useMemo(() => buildCalendarWeeks(year, month), [year, month])

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

  const selectedDate =
    selectedDay === null
      ? ""
      : `${year}-${String(month + 1).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`

  const projects = useMemo(
    () => [...new Set(tasks.map(task => task.project))].sort(),
    [tasks],
  )

  const filteredTasks = useMemo(
    () =>
      tasks.filter(task => {
        if (priorityFilter && task.priority !== priorityFilter) return false
        if (projectFilter && task.project !== projectFilter) return false
        if (hideCompleted && task.completed) return false
        if (onlyMine && user && !task.assignees.some(a => a.id === user.id)) return false
        return true
      }),
    [hideCompleted, onlyMine, priorityFilter, projectFilter, tasks, user],
  )

  const getDayTasks = useCallback(
    (day: number) => {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      return filteredTasks.filter(task => task.due_date === dateStr)
    },
    [filteredTasks, month, year],
  )

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

  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const monthTasksCount = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`
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
    () =>
      filteredTasks.filter(
        task =>
          task.due_date &&
          !task.completed &&
          new Date(task.due_date) < new Date(new Date().toDateString()),
      ).length,
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
      addToast(updatedTask.completed ? "Zadanie zakończone" : "Zadanie przywrócone", "success")
    } catch {
      addToast("Błąd aktualizacji zadania", "error")
    }
  }

  const createTask = async (data: TaskFormData) => {
    try {
      const createdTask = await api.tasks.create(data)
      setTasks(prev => [createdTask, ...prev])
      setShowCreate(false)
      addToast("Zadanie utworzone", "success")
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : "Błąd tworzenia zadania", "error")
      throw err
    }
  }

  const deleteTask = async (taskId: number) => {
    try {
      await api.tasks.delete(taskId)
      setTasks(prev => prev.filter(task => task.id !== taskId))
      setSelectedTask(null)
      addToast("Zadanie usunięte", "success")
    } catch {
      addToast("Błąd usuwania zadania", "error")
    }
  }

  const updateTask = (updatedTask: Task) => {
    setTasks(prev => prev.map(task => (task.id === updatedTask.id ? updatedTask : task)))
    setSelectedTask(updatedTask)
  }

  const clearFilters = () => {
    setPriorityFilter("")
    setProjectFilter("")
    setHideCompleted(false)
    setOnlyMine(false)
  }

  if (loading) return <CalendarSkeleton />

  return (
    <div className="space-y-5 page-enter">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Kalendarz</h2>
          <p className="text-sm text-muted-foreground">
            Widok terminów z szybkim podglądem dnia i akcjami.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToToday} className="btn btn-ghost btn-sm">Dzisiaj</button>
          <button onClick={prevMonth} className="btn btn-secondary btn-sm">←</button>
          <span className="min-w-[150px] text-center font-medium text-gray-900 dark:text-white">
            {months[month]} {year}
          </span>
          <button onClick={nextMonth} className="btn btn-secondary btn-sm">→</button>
        </div>
      </div>

      {/* Legend */}
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

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value as "" | Task["priority"])} className="input sm:w-40">
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
            <input type="checkbox" checked={hideCompleted} onChange={event => setHideCompleted(event.target.checked)} className="h-4 w-4 rounded border-border text-primary focus:ring-primary/50" />
            Ukryj zakończone
          </label>
          <label className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={onlyMine} onChange={event => setOnlyMine(event.target.checked)} className="h-4 w-4 rounded border-border text-primary focus:ring-primary/50" />
            Tylko moje
          </label>
        </div>
        <div className="flex gap-2">
          <button onClick={clearFilters} className="btn btn-ghost btn-sm">Wyczyść</button>
          {isAdminRole(user?.role) && (
            <button onClick={() => setShowCreate(true)} disabled={selectedDay === null} className="btn btn-primary btn-sm">
              <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Dodaj na dzień
            </button>
          )}
        </div>
      </div>

      {/* Calendar Grid + Sidebar */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <CalendarGrid
          year={year}
          month={month}
          today={today}
          selectedDay={selectedDay}
          calendarWeeks={calendarWeeks}
          getDayTasks={getDayTasks}
          onSelectDay={setSelectedDay}
          onSelectTask={(day: number, task: Task) => {
            setSelectedDay(day)
            setSelectedTask(task)
          }}
        />

        <aside className="card p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
                {selectedDay ? `Plan dnia: ${selectedDay} ${months[month].toLowerCase()}` : "Wybierz dzień"}
              </h3>
              <p className="text-xs text-muted-foreground">Kliknij zadanie, aby otworzyć szczegóły.</p>
            </div>
            {isAdminRole(user?.role) && selectedDay !== null && (
              <button onClick={() => setShowCreate(true)} className="btn btn-secondary btn-sm">
                Dodaj
              </button>
            )}
          </div>

          {selectedCalendarInfo && (
            <div className="mb-3 space-y-2">
              {selectedCalendarInfo.holidays.length > 0 && (
                <CalendarInfoBox label="Święta" value={selectedCalendarInfo.holidays.join(", ")}
                  className="border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200" />
              )}
              {selectedCalendarInfo.nameDays.length > 0 && (
                <CalendarInfoBox label="Imieniny" value={selectedCalendarInfo.nameDays.join(", ")}
                  className="border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200" />
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
                    <button onClick={() => setSelectedTask(task)}
                      className={`min-w-0 flex-1 text-left text-sm font-semibold hover:text-primary ${task.completed ? "line-through text-muted-foreground" : "text-gray-900 dark:text-white"}`}>
                      {task.title}
                    </button>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${priorityClass(task.priority)}`}>
                      {priorityLabel(task.priority)}
                    </span>
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">{task.project}</p>
                  <button onClick={() => void toggleTaskComplete(task.id)}
                    className={`btn btn-sm w-full ${task.completed ? "btn-secondary" : "btn-primary"}`}>
                    {task.completed ? "Przywróć" : "Oznacz jako zakończone"}
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      {/* Modals */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)}>
          <TaskForm
            initialData={{ title: "", due_date: selectedDate, priority: "medium", project: "", notes: "", assignee_ids: [] }}
            heading="Nowe zadanie" submitLabel="Utwórz"
            onSubmit={data => createTask(data)} onCancel={() => setShowCreate(false)} />
        </Modal>
      )}

      {selectedTask && (
        <Modal onClose={() => setSelectedTask(null)}>
          <TaskDetail
            task={selectedTask}
            onDelete={id => void deleteTask(id)}
            onComplete={id => void toggleTaskComplete(id)}
            onUpdate={updateTask}
            onClose={() => setSelectedTask(null)} />
        </Modal>
      )}
    </div>
  )
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
