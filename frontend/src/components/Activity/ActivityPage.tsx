import { useState, useEffect, useCallback, useMemo } from 'react'
import type { ActivityLog } from '@/types'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'
import { ActivitySkeleton } from '@/components/common/Skeletons'
import { formatDateTime } from '@/utils/helpers'
import { EmptyState } from '@/components/common/EmptyState'

const ACTION_LABELS: Record<string, string> = {
  created: 'Utworzono zadanie',
  updated: 'Zaktualizowano zadanie',
  completed: 'Zakonczono zadanie',
  reopened: 'Przywrocono zadanie',
  commented: 'Dodano komentarz',
  mentioned: 'Dodano wzmianke',
  subtask_created: 'Dodano podzadanie',
  subtask_toggle: 'Zmieniono podzadanie',
  subtask_completed: 'Zakonczono podzadanie',
  subtask_reopened: 'Przywrocono podzadanie',
  subtask_deleted: 'Usunieto podzadanie',
  dependency_added: 'Dodano zaleznosc',
  dependency_removed: 'Usunieto zaleznosc',
  project_created: 'Utworzono projekt',
  project_updated: 'Zaktualizowano projekt',
  project_archived: 'Zakonczono projekt',
  project_completed: 'Projekt zakonczony',
}

const ACTION_ICONS: Record<string, string> = {
  created: '\u25CF',
  updated: '\u270E',
  completed: '\u2713',
  reopened: '\u21BA',
  commented: '\uD83D\uDCAC',
  mentioned: '@',
  subtask_created: '\u229E',
  subtask_completed: '\u229F',
  subtask_deleted: '\u229F',
  dependency_added: '\u21E2',
  dependency_removed: '\u21E0',
}

const ACTION_COLORS: Record<string, string> = {
  created: 'border-l-blue-500',
  updated: 'border-l-amber-500',
  completed: 'border-l-green-500',
  reopened: 'border-l-purple-500',
  commented: 'border-l-sky-500',
  mentioned: 'border-l-pink-500',
  subtask_created: 'border-l-teal-500',
  subtask_completed: 'border-l-teal-500',
  subtask_deleted: 'border-l-gray-500',
  dependency_added: 'border-l-orange-500',
  dependency_removed: 'border-l-orange-500',
}

const ACTION_GROUPS = [
  { label: 'Wszystkie', value: '' },
  { label: 'Zadania', value: 'created,updated,completed,reopened' },
  { label: 'Komentarze', value: 'commented,mentioned' },
  { label: 'Podzadania', value: 'subtask_created,subtask_completed,subtask_deleted,subtask_toggle' },
  { label: 'Zaleznosci', value: 'dependency_added,dependency_removed' },
  { label: 'Projekty', value: 'project_created,project_updated,project_archived,project_completed' },
]

function activityLabel(action: string): string {
  return ACTION_LABELS[action] || action
}

function activityIcon(action: string): string {
  return ACTION_ICONS[action] || '\u25CB'
}

function activityColor(action: string): string {
  return ACTION_COLORS[action] || 'border-l-gray-400'
}

function getActivityDetails(item: ActivityLog): string {
  const details = item.details ?? {}
  if (typeof details.title === 'string') return details.title
  if (typeof details.text === 'string') return details.text
  if (typeof details.subtask === 'string') return details.subtask

  const changes = details.changes
  if (changes && typeof changes === 'object' && !Array.isArray(changes)) {
    const labels = Object.entries(
      changes as Record<string, { from?: unknown; to?: unknown }>,
    ).map(
      ([field, change]) => {
        const fromVal = change.from === null || change.from === undefined || change.from === '' ? '-' : String(change.from)
        const toVal = change.to === null || change.to === undefined || change.to === '' ? '-' : String(change.to)
        return fieldLabel(field) + ': ' + fromVal + ' \u2192 ' + toVal
      },
    )
    return labels.join(', ')
  }

  return ''
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    title: 'Tytul',
    priority: 'Priorytet',
    project: 'Projekt',
    project_id: 'Projekt',
    due_date: 'Termin',
    notes: 'Notatki',
    completed: 'UKonczone',
    status: 'Status',
    assignee_ids: 'Przypisani',
  }
  return labels[field] || field
}

function formatGroupDate(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Dzisiaj'
  if (date.toDateString() === yesterday.toDateString()) return 'Wczoraj'

  return date.toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  })
}

type GroupedActivity = {
  label: string;
  items: ActivityLog[];
}

function groupByDate(activity: ActivityLog[]): GroupedActivity[] {
  if (activity.length === 0) return []

  const groups: Map<string, ActivityLog[]> = new Map()

  for (const item of activity) {
    const key = formatGroupDate(item.created_at)
    const existing = groups.get(key) ?? []
    existing.push(item)
    groups.set(key, existing)
  }

  const groupKeys = [...groups.keys()]
  const sortedKeys = groupKeys.sort((a, b) => {
    if (a === 'Dzisiaj') return -1
    if (b === 'Dzisiaj') return 1
    if (a === 'Wczoraj') return -1
    if (b === 'Wczoraj') return 1
    return 0
  })

  return sortedKeys.map(label => ({
    label,
    items: groups.get(label)!,
  }))
}

export default function ActivityPage() {
  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState('')
  const { addToast } = useToast()

  const fetchActivity = useCallback(async () => {
    try {
      const res = await api.activity.getAll(200)
      setActivity(res.activity)
    } catch {
      addToast('Blad ladowania aktywnosci', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { fetchActivity() }, [fetchActivity])

  const filteredActivity = useMemo(() => {
    if (!actionFilter) return activity
    const allowedActions = actionFilter.split(',')
    return activity.filter(item => allowedActions.includes(item.action))
  }, [activity, actionFilter])

  const grouped = useMemo(() => groupByDate(filteredActivity), [filteredActivity])

  if (loading) {
    return <ActivitySkeleton />
  }

  return (
    <div className="space-y-6 page-enter">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Historia aktywnosci</h2>
          <p className="text-sm text-muted-foreground">
            Ostatnie {activity.length} zdarzen w aplikacji.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtr:</span>
          <select
            value={actionFilter}
            onChange={event => setActionFilter(event.target.value)}
            className="input h-9 text-xs sm:w-44"
          >
            {ACTION_GROUPS.map(group => (
              <option key={group.value} value={group.value}>{group.label}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredActivity.length === 0 ? (
        <EmptyState
          type="activity"
          title="Brak aktywnosci"
          description={actionFilter ? 'Sprobuj zmienic filtr.' : 'Gdy pojawia sie zdarzenia, zobaczysz je tutaj.'}
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <section key={group.label}>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </h3>
              <div className="space-y-2">
                {group.items.map(item => {
                  const details = getActivityDetails(item)
                  return (
                    <div
                      key={item.id}
                      className={'card border-l-4 p-4 ' + activityColor(item.action)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                              {activityIcon(item.action)}
                            </span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {activityLabel(item.action)}
                            </span>
                            {item.task_id && (
                              <>
                                <span className="text-muted-foreground">w</span>
                                <span className="font-medium text-primary">
                                  zadaniu #{item.task_id}
                                </span>
                              </>
                            )}
                          </div>
                          {details && (
                            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                              {details}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDateTime(item.created_at)}
                          </span>
                          {item.username && (
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                              {item.username}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
