import { useCallback, useEffect, useState } from 'react'
import type { Task, TodayTasksResponse } from '@/types'
import { api } from '@/api/client'
import { useSocket } from '@/store/SocketContext'
import { useToast } from '@/store/ToastContext'
import { TasksPageSkeleton } from '@/components/common/Skeletons'

const emptyToday: TodayTasksResponse = {
  overdue: [],
  today: [],
  upcoming: [],
  counts: {
    overdue: 0,
    today: 0,
    upcoming: 0,
    total: 0,
    blocked: 0,
    ready: 0,
    high_priority: 0,
  },
  generated_at: '',
}

const refreshActions = new Set([
  'created',
  'updated',
  'completed',
  'reopened',
  'deleted',
  'bulk_completed',
  'bulk_deleted',
  'bulk_updated',
  'dependency_added',
  'dependency_removed',
])

export default function TodayPage() {
  const [data, setData] = useState<TodayTasksResponse>(emptyToday)
  const [loading, setLoading] = useState(true)
  const { lastTaskEvent } = useSocket()
  const { addToast } = useToast()

  const loadToday = useCallback(async () => {
    try {
      const response = await api.tasks.today()
      setData(response)
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd ładowania widoku Dziś', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadToday()
  }, [loadToday])

  useEffect(() => {
    if (!lastTaskEvent || !refreshActions.has(lastTaskEvent.action)) return
    void loadToday()
  }, [lastTaskEvent, loadToday])

  const completeTask = async (taskId: number) => {
    try {
      await api.tasks.complete(taskId)
      await loadToday()
      addToast('Zadanie zakończone', 'success')
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd zmiany stanu', 'error')
    }
  }

  const startTask = async (taskId: number) => {
    try {
      await api.tasks.update(taskId, { status: 'in_progress', completed: false })
      await loadToday()
      addToast('Zadanie rozpoczęte', 'success')
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd zmiany statusu', 'error')
    }
  }

  if (loading) {
    return <TasksPageSkeleton />
  }

  return (
    <div className="space-y-6 page-enter">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Dziś</h2>
          <p className="text-sm text-muted-foreground">Najbliższe terminy i zadania wymagające uwagi.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
          <Metric label="Po terminie" value={data.counts.overdue} tone="danger" />
          <Metric label="Dziś" value={data.counts.today} tone="primary" />
          <Metric label="7 dni" value={data.counts.upcoming} tone="default" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Gotowe do pracy" value={data.counts.ready} tone="success" />
        <Metric label="Zablokowane" value={data.counts.blocked} tone="warning" />
        <Metric label="Wysoki priorytet" value={data.counts.high_priority} tone="danger" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <TaskSection
          title="Po terminie"
          tasks={data.overdue}
          empty="Nie ma zaległych zadań."
          tone="danger"
          onComplete={completeTask}
          onStart={startTask}
        />
        <TaskSection
          title="Na dziś"
          tasks={data.today}
          empty="Na dziś nic nie czeka."
          tone="primary"
          onComplete={completeTask}
          onStart={startTask}
        />
        <TaskSection
          title="Następne 7 dni"
          tasks={data.upcoming}
          empty="Brak zadań w najbliższym tygodniu."
          tone="default"
          onComplete={completeTask}
          onStart={startTask}
        />
      </div>
    </div>
  )
}

function TaskSection({
  title,
  tasks,
  empty,
  tone,
  onComplete,
  onStart,
}: {
  title: string;
  tasks: Task[];
  empty: string;
  tone: 'danger' | 'primary' | 'default';
  onComplete: (taskId: number) => Promise<void>;
  onStart: (taskId: number) => Promise<void>;
}) {
  return (
    <section className={`rounded-lg border border-border bg-card p-4 ${sectionAccent(tone)}`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
        <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-white/10 dark:text-gray-300">
          {tasks.length}
        </span>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
          {empty}
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => (
            <TodayTaskRow
              key={task.id}
              task={task}
              onComplete={() => onComplete(task.id)}
              onStart={() => onStart(task.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function TodayTaskRow({ task, onComplete, onStart }: { task: Task; onComplete: () => void; onStart: () => void }) {
  return (
    <article className="rounded-lg border border-border bg-background p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{task.project}</p>
          <h4 className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">{task.title}</h4>
        </div>
        <div className="flex gap-1">
          {task.status === 'todo' && (
            <button onClick={onStart} className="btn btn-ghost btn-sm h-8 px-2" title="Rozpocznij zadanie">
              Start
            </button>
          )}
          <button
            onClick={onComplete}
            disabled={task.is_blocked}
            className="btn btn-ghost btn-sm h-8 px-2 disabled:cursor-not-allowed disabled:opacity-50"
            title={task.is_blocked ? 'Zadanie zablokowane' : 'Zakończ zadanie'}
          >
            <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={`badge ${priorityClass(task.priority)}`}>{priorityLabel(task.priority)}</span>
        {task.is_blocked && (
          <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Zablokowane</span>
        )}
        {task.status === 'in_progress' && (
          <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">W toku</span>
        )}
        {task.due_date && (
          <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {formatDate(task.due_date)}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {task.assignees.length > 0 ? task.assignees.map(assignee => assignee.username).join(', ') : 'Nieprzypisane'}
        </span>
      </div>
    </article>
  )
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'danger' | 'primary' | 'default' | 'success' | 'warning' }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${metricClass(tone)}`}>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}

function sectionAccent(tone: 'danger' | 'primary' | 'default') {
  if (tone === 'danger') return 'border-t-4 border-t-red-500'
  if (tone === 'primary') return 'border-t-4 border-t-primary'
  return 'border-t-4 border-t-amber-400'
}

function metricClass(tone: 'danger' | 'primary' | 'default' | 'success' | 'warning') {
  if (tone === 'danger') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300'
  if (tone === 'primary') return 'border-primary/30 bg-primary/10 text-primary'
  if (tone === 'success') return 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300'
  if (tone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300'
  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300'
}

function priorityLabel(priority: Task['priority']) {
  return priority === 'high' ? 'Wysoki' : priority === 'medium' ? 'Średni' : 'Niski'
}

function priorityClass(priority: Task['priority']) {
  if (priority === 'high') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  if (priority === 'medium') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })
}
