import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { Task, User } from '@/types'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'
import { priorityLabel, priorityClass, isOverdue } from '@/utils/helpers'
import { motion, AnimatePresence } from 'framer-motion'

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface Props {
  tasks: Task[]
  onNavigate: (taskId: number) => void
  onComplete: (taskId: number) => Promise<void>
  onUpdate?: (taskId: number, data: { title?: string; priority?: Task['priority']; assignee_ids?: number[] }) => Promise<void>
  selectable?: boolean
  selectedTaskIds: Set<number>
  onSelectionChange: (taskId: number, selected: boolean) => void
  onToggleAll: (selected: boolean) => void
}

type SortKey = 'title' | 'priority' | 'status' | 'project' | 'due_date' | 'assignee' | 'subtask'
type SortDir = 'asc' | 'desc'

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const priorityRank: Record<Task['priority'], number> = { high: 0, medium: 1, low: 2 }

const statusRank: Record<string, number> = { todo: 0, in_progress: 1, done: 2 }

function assigneeLabel(task: Task): string {
  if (task.assignees.length === 0) return '—'
  return task.assignees.map(a => a.username).join(', ')
}

function subtaskRatio(task: Task): string {
  if (task.subtasks.length === 0) return ''
  return `${task.subtasks.filter(s => s.completed).length}/${task.subtasks.length}`
}

function subtaskPct(task: Task): number {
  if (task.subtasks.length === 0) return -1
  return (task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100
}

/* ------------------------------------------------------------------ */
/*  Column definitions                                                */
/* ------------------------------------------------------------------ */

interface Column {
  key: SortKey | null   // null = non-sortable column (checkbox, actions)
  label: string
  className: string     // Tailwind width / alignment classes
  sortable: boolean
}

const columns: Column[] = [
  { key: null,            label: '',       className: 'w-10 pl-3',      sortable: false },
  { key: 'title',         label: 'Tytuł',  className: 'min-w-[220px] flex-1', sortable: true  },
  { key: 'project',       label: 'Projekt', className: 'w-36',          sortable: true  },
  { key: 'priority',      label: 'Priorytet', className: 'w-28',        sortable: true  },
  { key: 'status',        label: 'Status',  className: 'w-28',          sortable: true  },
  { key: 'assignee',      label: 'Wykonawca', className: 'w-40',        sortable: true  },
  { key: 'due_date',      label: 'Termin',   className: 'w-28',         sortable: true  },
  { key: 'subtask',       label: 'Podzad.',  className: 'w-20',         sortable: true  },
  { key: null,            label: '',         className: 'w-16 pr-3',    sortable: false },
]

/* ------------------------------------------------------------------ */
/*  Sorter                                                            */
/* ------------------------------------------------------------------ */

function sortTasks(tasks: Task[], key: SortKey, dir: SortDir): Task[] {
  return [...tasks].sort((a, b) => {
    let cmp = 0
    switch (key) {
      case 'title':
        cmp = a.title.localeCompare(b.title)
        break
      case 'priority':
        cmp = priorityRank[a.priority] - priorityRank[b.priority]
        break
      case 'status':
        cmp = statusRank[a.status] - statusRank[b.status]
        break
      case 'project':
        cmp = (a.project || '').localeCompare(b.project || '')
        break
      case 'due_date':
        cmp = (a.due_date || 'zzzz').localeCompare(b.due_date || 'zzzz')
        break
      case 'assignee':
        cmp = assigneeLabel(a).localeCompare(assigneeLabel(b))
        break
      case 'subtask': {
        const pctA = subtaskPct(a)
        const pctB = subtaskPct(b)
        cmp = (pctA < 0 ? -1 : pctA) - (pctB < 0 ? -1 : pctB)
        break
      }
    }
    return dir === 'asc' ? cmp : -cmp
  })
}

/* ------------------------------------------------------------------ */
/*  Sort header icon                                                  */
/* ------------------------------------------------------------------ */

function SortIcon({ dir }: { dir: SortDir }) {
  return (
    <svg className="ml-1 inline-block h-3 w-3 align-middle" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      {dir === 'asc' ? (
        <path d="M6 2l4 6H2z" />
      ) : (
        <path d="M6 10l4-6H2z" />
      )}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export default function TaskTable({
  tasks,
  onNavigate,
  onComplete,
  onUpdate,
  selectable = false,
  selectedTaskIds,
  onSelectionChange,
  onToggleAll,
}: Props) {
  const { addToast } = useToast()
  const [sortKey, setSortKey] = useState<SortKey>('due_date')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // --- Inline editing state ---
  const [editingCell, setEditingCell] = useState<{ taskId: number; field: 'title' | 'priority' | 'assignee' } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const allVisibleSelected = tasks.length > 0 && tasks.every(t => selectedTaskIds.has(t.id))
  const someSelected = tasks.some(t => selectedTaskIds.has(t.id))

  // Auto-focus input when title editing
  useEffect(() => {
    if (editingCell?.field === 'title' && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingCell])

  // Click-away for dropdowns
  useEffect(() => {
    if (!editingCell || editingCell.field === 'title') return
    const handleClickAway = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setEditingCell(null)
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickAway)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickAway)
    }
  }, [editingCell])

  // Fetch users when assignee editor opens
  useEffect(() => {
    if (editingCell?.field !== 'assignee' || users.length > 0 || usersLoading) return
    setUsersLoading(true)
    api.users.getAll()
      .then(res => setUsers(res.users))
      .catch(() => addToast('Błąd ładowania użytkowników', 'error'))
      .finally(() => setUsersLoading(false))
  }, [editingCell, users.length, usersLoading, addToast])

  // --- Sort toggle ---
  const handleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        return prev
      }
      setSortDir('asc')
      return key
    })
  }, [])

  // --- Inline save handlers ---
  const saveTitle = async (taskId: number) => {
    const trimmed = editValue.trim()
    if (!trimmed || !onUpdate) {
      setEditingCell(null)
      return
    }
    const task = tasks.find(t => t.id === taskId)
    if (!task || trimmed === task.title) {
      setEditingCell(null)
      return
    }
    setSaving(true)
    try {
      await onUpdate(taskId, { title: trimmed })
      setEditingCell(null)
    } catch {
      setEditValue(task.title)
    } finally {
      setSaving(false)
    }
  }

  const changePriority = async (taskId: number, newPriority: Task['priority']) => {
    if (!onUpdate) return
    const task = tasks.find(t => t.id === taskId)
    if (task?.priority === newPriority) { setEditingCell(null); return }
    setSaving(true)
    try {
      await onUpdate(taskId, { priority: newPriority })
      setEditingCell(null)
    } catch { /* parent shows toast */ }
      finally { setSaving(false) }
  }

  const changeAssignee = async (taskId: number, userId: number | null) => {
    if (!onUpdate) return
    const task = tasks.find(t => t.id === taskId)
    const currentIds = task?.assignees.map(a => a.id) ?? []
    const newIds = userId === null ? [] : [userId]
    if (JSON.stringify(currentIds) === JSON.stringify(newIds)) { setEditingCell(null); return }
    setSaving(true)
    try {
      await onUpdate(taskId, { assignee_ids: newIds })
      setEditingCell(null)
    } catch { /* parent shows toast */ }
      finally { setSaving(false) }
  }

  // --- Sorted tasks ---
  const sortedTasks = useMemo(() => sortTasks(tasks, sortKey, sortDir), [tasks, sortKey, sortDir])

  // --- Render ---
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {columns.map(col => (
              <th
                key={col.label}
                className={`${col.className} px-2 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ${
                  col.sortable ? 'cursor-pointer select-none hover:text-foreground transition-colors' : ''
                }`}
                onClick={() => col.sortable && col.key && handleSort(col.key)}
              >
                {col.key === null && col.label === '' && selectable ? (
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={input => {
                      if (input) input.indeterminate = someSelected && !allVisibleSelected
                    }}
                    onChange={e => onToggleAll(e.target.checked)}
                    onClick={e => e.stopPropagation()}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary/50"
                    aria-label="Zaznacz wszystkie widoczne"
                  />
                ) : (
                  <span className="inline-flex items-center">
                    {col.label}
                    {col.sortable && col.key === sortKey && <SortIcon dir={sortDir} />}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <AnimatePresence mode="popLayout">
            {sortedTasks.map((task, idx) => (
              <TableRow
                key={task.id}
                task={task}
                idx={idx}
                selectable={selectable}
                selected={selectedTaskIds.has(task.id)}
                onSelectionChange={onSelectionChange}
                onNavigate={onNavigate}
                onComplete={onComplete}
                onUpdate={onUpdate}
                editingCell={editingCell}
                setEditingCell={setEditingCell}
                editValue={editValue}
                setEditValue={setEditValue}
                saving={saving}
                saveTitle={saveTitle}
                changePriority={changePriority}
                changeAssignee={changeAssignee}
                inputRef={inputRef}
                dropdownRef={dropdownRef}
                users={users}
                usersLoading={usersLoading}
              />
            ))}
          </AnimatePresence>
        </tbody>
      </table>
      {sortedTasks.length === 0 && (
        <div className="flex items-center justify-center px-4 py-12 text-sm text-muted-foreground">
          Brak zadań do wyświetlenia w tabeli.
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  TableRow (extracted to keep the main file manageable)             */
/* ------------------------------------------------------------------ */

interface RowProps {
  task: Task
  idx: number
  selectable: boolean
  selected: boolean
  onSelectionChange: (taskId: number, selected: boolean) => void
  onNavigate: (taskId: number) => void
  onComplete: (taskId: number) => Promise<void>
  onUpdate?: (taskId: number, data: { title?: string; priority?: Task['priority']; assignee_ids?: number[] }) => Promise<void>
  editingCell: { taskId: number; field: 'title' | 'priority' | 'assignee' } | null
  setEditingCell: (cell: { taskId: number; field: 'title' | 'priority' | 'assignee' } | null) => void
  editValue: string
  setEditValue: (v: string) => void
  saving: boolean
  saveTitle: (taskId: number) => Promise<void>
  changePriority: (taskId: number, priority: Task['priority']) => Promise<void>
  changeAssignee: (taskId: number, userId: number | null) => Promise<void>
  inputRef: React.RefObject<HTMLInputElement | null>
  dropdownRef: React.RefObject<HTMLDivElement | null>
  users: User[]
  usersLoading: boolean
}

function TableRow({
  task, idx, selectable, selected, onSelectionChange,
  onNavigate, onComplete, onUpdate,
  editingCell, setEditingCell, editValue, setEditValue,
  saving, saveTitle, changePriority, changeAssignee,
  inputRef, dropdownRef, users, usersLoading,
}: RowProps) {
  const isEditing = editingCell?.taskId === task.id
  const completedSubtasks = task.subtasks.filter(s => s.completed).length
  const openSubtasks = task.subtasks.length - completedSubtasks
  const isBlocked = task.is_blocked && !task.completed
  const completionBlocked = isBlocked || openSubtasks > 0

  const rowClass = idx % 2 === 0
    ? 'bg-background'
    : 'bg-muted/20'

  return (
    <motion.tr
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20, height: 0, padding: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
      className={`${rowClass} border-b border-border hover:bg-muted/40 group ${
        task.completed ? 'opacity-60' : ''
      }`}
    >
      {/* Checkbox */}
      <td className="w-10 px-2 py-2.5 pl-3">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={e => onSelectionChange(task.id, e.target.checked)}
            onClick={e => e.stopPropagation()}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary/50"
            aria-label={`Zaznacz ${task.title}`}
          />
        )}
      </td>

      {/* Title */}
      <td className="min-w-[220px] flex-1 px-2 py-2.5">
        {isEditing && editingCell?.field === 'title' ? (
          <div className="relative">
            <input
              ref={inputRef as React.Ref<HTMLInputElement>}
              type="text"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => {
                e.stopPropagation()
                if (e.key === 'Enter') { e.preventDefault(); void saveTitle(task.id) }
                if (e.key === 'Escape') { e.preventDefault(); setEditingCell(null); setEditValue(task.title) }
              }}
              onBlur={() => void saveTitle(task.id)}
              className="input h-7 w-full text-sm font-medium"
              disabled={saving}
              aria-label="Edytuj tytuł"
            />
            {saving && (
              <span className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate(task.id)}
              className={`truncate text-left text-sm font-medium transition-colors ${
                task.completed
                  ? 'line-through text-muted-foreground'
                  : 'text-gray-900 dark:text-white hover:text-primary'
              }`}
            >
              {task.title}
            </button>
            {onUpdate && (
              <button
                onClick={e => { e.stopPropagation(); setEditValue(task.title); setEditingCell({ taskId: task.id, field: 'title' }) }}
                className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Edytuj tytuł"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}
            {task.is_blocked && !task.completed && (
              <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] px-1.5 py-0">Z</span>
            )}
          </div>
        )}
      </td>

      {/* Project */}
      <td className="w-36 px-2 py-2.5">
        <span className="text-xs text-muted-foreground truncate block">
          {task.project || '—'}
        </span>
      </td>

      {/* Priority (editable) */}
      <td className="w-28 px-2 py-2.5">
        {isEditing && editingCell?.field === 'priority' ? (
          <div ref={dropdownRef as React.RefObject<HTMLDivElement>} onClick={e => e.stopPropagation()}>
            <div className="flex gap-0.5 rounded-md border border-border bg-card p-0.5 shadow-lg">
              {(['high', 'medium', 'low'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => void changePriority(task.id, p)}
                  disabled={saving}
                  className={`rounded px-2 py-1 text-[11px] font-semibold transition-all ${
                    p === task.priority
                      ? `${priorityClass(p)} ring-1 ring-primary/30`
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {priorityLabel(p)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            onClick={e => {
              e.stopPropagation()
              if (onUpdate && !saving) setEditingCell({ taskId: task.id, field: 'priority' })
            }}
            className={`badge text-[11px] ${onUpdate ? 'cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all' : ''} ${priorityClass(task.priority)}`}
          >
            {priorityLabel(task.priority)}
          </button>
        )}
      </td>

      {/* Status */}
      <td className="w-28 px-2 py-2.5">
        <span className={`badge text-[11px] ${
          task.status === 'done' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
          task.status === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
          'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
        }`}>
          {task.status === 'todo' ? 'Do zrob.' : task.status === 'in_progress' ? 'W toku' : 'Zakon.'}
        </span>
      </td>

      {/* Assignees (editable) */}
      <td className="w-40 px-2 py-2.5">
        {isEditing && editingCell?.field === 'assignee' ? (
          <div ref={dropdownRef as React.RefObject<HTMLDivElement>} onClick={e => e.stopPropagation()}>
            <div className="rounded-lg border border-border bg-card p-1 shadow-lg min-w-[180px]">
              {usersLoading ? (
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-xs text-muted-foreground">Ładowanie...</span>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => void changeAssignee(task.id, null)}
                    disabled={saving}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors hover:bg-muted ${
                      task.assignees.length === 0 ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    — Nieprzypisane
                  </button>
                  <div className="mx-2 my-1 border-t border-border" />
                  {users.map(user => {
                    const isAssigned = task.assignees.some(a => a.id === user.id)
                    return (
                      <button
                        key={user.id}
                        onClick={() => void changeAssignee(task.id, user.id)}
                        disabled={saving}
                        className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors hover:bg-muted ${
                          isAssigned ? 'bg-primary/10 font-medium text-primary' : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[9px] font-bold text-primary">
                          {user.username.charAt(0).toUpperCase()}
                        </span>
                        {user.username}
                        {isAssigned && <span className="ml-auto text-primary">✓</span>}
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          </div>
        ) : (
          <button
            onClick={e => {
              e.stopPropagation()
              if (onUpdate && !saving) setEditingCell({ taskId: task.id, field: 'assignee' })
            }}
            className={`truncate block text-xs text-left w-full ${
              onUpdate ? 'cursor-pointer hover:text-primary transition-colors' : ''
            } ${
              task.assignees.length === 0 ? 'text-muted-foreground italic' : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            {assigneeLabel(task)}
          </button>
        )}
      </td>

      {/* Due date */}
      <td className="w-28 px-2 py-2.5">
        {task.due_date ? (
          <span className={`text-xs ${
            isOverdue(task.due_date, task.completed)
              ? 'font-medium text-destructive'
              : 'text-muted-foreground'
          }`}>
            {new Date(task.due_date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* Subtask progress */}
      <td className="w-20 px-2 py-2.5">
        {subtaskPct(task) >= 0 ? (
          <div className="flex items-center gap-1.5" title={`${completedSubtasks}/${task.subtasks.length} podzadań`}>
            <div className="h-1.5 w-10 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${subtaskPct(task)}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{subtaskRatio(task)}</span>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </td>

      {/* Complete button */}
      <td className="w-16 px-2 py-2.5 pr-3">
        <button
          onClick={e => { e.stopPropagation(); if (!completionBlocked && !saving) void onComplete(task.id) }}
          disabled={completionBlocked || saving}
          title={
            task.completed ? 'Przywróć' :
            isBlocked ? 'Zablokowane' :
            openSubtasks > 0 ? `Najpierw zakończ podzadania: ${openSubtasks}` :
            'Zakończ'
          }
          className={`flex h-7 w-7 items-center justify-center rounded-md border transition-all ${
            task.completed
              ? 'border-green-200 bg-green-50 text-green-600 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
              : 'border-border text-muted-foreground/50 hover:border-green-300 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20'
          } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </td>
    </motion.tr>
  )
}
