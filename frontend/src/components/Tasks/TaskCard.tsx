import { useState, useEffect, useRef } from 'react'
import type { Task, User } from '@/types'
import { api } from '@/api/client'
import { formatDate, isOverdue } from '@/utils/helpers'
import { useToast } from '@/store/ToastContext'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion } from 'framer-motion'

const priorityConfig = {
  high: { label: 'Wysoki', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', accent: 'border-l-red-500' },
  medium: { label: 'Średni', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', accent: 'border-l-amber-500' },
  low: { label: 'Niski', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', accent: 'border-l-green-500' },
}

const statusConfig: Record<string, { label: string; className: string }> = {
  todo: { label: 'Do zrobienia', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  in_progress: { label: 'W toku', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  done: { label: 'Zakończone', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
}

interface Props {
  task: Task;
  onClick: () => void;
  onComplete: () => void;
  onUpdate?: (taskId: number, data: { title?: string; priority?: 'low' | 'medium' | 'high'; assignee_ids?: number[] }) => Promise<void>;
  selectable?: boolean;
  selected?: boolean;
  onSelectionChange?: (selected: boolean) => void;
}

export default function TaskCard({ task, onClick, onComplete, onUpdate, selectable = false, selected = false, onSelectionChange }: Props) {
  const { addToast } = useToast()
  const priority = priorityConfig[task.priority]
  const status = statusConfig[task.status] || statusConfig.todo
  const completedSubtasks = task.subtasks.filter(subtask => subtask.completed).length
  const blocked = task.is_blocked && !task.completed
  const openSubtasks = task.subtasks.length - completedSubtasks
  const hasOpenSubtasks = !task.completed && openSubtasks > 0
  const completionBlocked = blocked || hasOpenSubtasks
  const completionTitle = task.completed
    ? 'Przywróć zadanie'
    : blocked
      ? 'Zadanie zablokowane przez zależności'
      : hasOpenSubtasks
        ? `Najpierw zakończ podzadania: ${openSubtasks}`
        : 'Zakończ zadanie'

  // --- Sortable (drag-to-reorder) ---
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }

  // --- Inline editing state ---
  const [editingField, setEditingField] = useState<'title' | 'priority' | 'assignee' | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Auto-focus title input when entering edit mode
  useEffect(() => {
    if (editingField === 'title' && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [editingField])

  // Click-away handler for dropdowns (priority & assignee)
  useEffect(() => {
    if (!editingField || editingField === 'title') return
    const handleClickAway = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setEditingField(null)
      }
    }
    // Delay adding listener to avoid closing immediately
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickAway)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickAway)
    }
  }, [editingField])

  // Fetch users when assignee editor opens
  useEffect(() => {
    if (editingField !== 'assignee' || users.length > 0 || usersLoading) return
    setUsersLoading(true)
    api.users.getAll()
      .then(res => setUsers(res.users))
      .catch(() => addToast('Błąd ładowania użytkowników', 'error'))
      .finally(() => setUsersLoading(false))
  }, [editingField, users.length, usersLoading, addToast])

  // --- Handlers ---
  const startEditTitle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onUpdate) return
    setEditTitle(task.title)
    setEditingField('title')
  }

  const saveTitle = async () => {
    const trimmed = editTitle.trim()
    if (!trimmed || trimmed === task.title || !onUpdate) {
      setEditingField(null)
      return
    }
    setSaving(true)
    try {
      await onUpdate(task.id, { title: trimmed })
      setEditingField(null)
    } catch {
      // Parent handles toast; revert input to original
      setEditTitle(task.title)
    } finally {
      setSaving(false)
    }
  }

  const cancelEditTitle = () => {
    setEditingField(null)
    setEditTitle(task.title)
  }

  const changePriority = async (newPriority: 'low' | 'medium' | 'high') => {
    if (newPriority === task.priority || !onUpdate) {
      setEditingField(null)
      return
    }
    setSaving(true)
    try {
      await onUpdate(task.id, { priority: newPriority })
      setEditingField(null)
    } catch {
      // Parent handles toast
    } finally {
      setSaving(false)
    }
  }

  const changeAssignee = async (userId: number | null) => {
    const currentIds = task.assignees.map(a => a.id)
    const newIds = userId === null ? [] : [userId]
    if (JSON.stringify(currentIds) === JSON.stringify(newIds) || !onUpdate) {
      setEditingField(null)
      return
    }
    setSaving(true)
    try {
      await onUpdate(task.id, { assignee_ids: newIds })
      setEditingField(null)
    } catch {
      // Parent handles toast
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      ref={setNodeRef}
      style={sortableStyle}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, y: -10 }}
      transition={{ type: 'spring', stiffness: 350, damping: 30, mass: 0.8 }}
      className={`group card cursor-pointer border-l-4 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md ${
        priority.accent
      } ${selected ? 'ring-2 ring-primary/40' : ''} ${task.completed ? 'opacity-70' : ''} ${isDragging ? 'z-50 shadow-xl ring-2 ring-primary/30 !transition-none' : ''}`}
      onClick={editingField || isDragging ? undefined : onClick}
    >
      {/* Drag handle */}
      {!task.completed && onUpdate && (
        <button
          {...attributes}
          {...listeners}
          onClick={e => e.stopPropagation()}
          className="flex w-full cursor-grab items-center justify-center py-1 text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Przeciągnij, aby zmienić kolejność"
          tabIndex={-1}
        >
          <svg className="h-4 w-6" viewBox="0 0 24 8" fill="currentColor" aria-hidden="true">
            <circle cx="8" cy="2" r="1.5" />
            <circle cx="16" cy="2" r="1.5" />
            <circle cx="8" cy="6" r="1.5" />
            <circle cx="16" cy="6" r="1.5" />
          </svg>
        </button>
      )}

      <div className="px-4 pb-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={event => onSelectionChange?.(event.target.checked)}
              onClick={event => event.stopPropagation()}
              className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary/50"
              aria-label={`Zaznacz zadanie ${task.title}`}
            />
          )}
          <div className="min-w-0 flex-1" onClick={e => editingField && e.stopPropagation()}>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{task.project}</p>
            {editingField === 'title' ? (
              <div className="relative">
                <input
                  ref={titleInputRef}
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onKeyDown={e => {
                    e.stopPropagation()
                    if (e.key === 'Enter') { e.preventDefault(); void saveTitle() }
                    if (e.key === 'Escape') { e.preventDefault(); cancelEditTitle() }
                  }}
                  onBlur={() => void saveTitle()}
                  onClick={e => e.stopPropagation()}
                  className="input h-8 text-base font-semibold"
                  disabled={saving}
                  aria-label="Edytuj tytuł"
                />
                {saving && (
                  <span className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                )}
              </div>
            ) : (
              <h3
                onClick={onUpdate ? startEditTitle : undefined}
                className={`${onUpdate ? 'cursor-text hover:bg-muted/50 -mx-1 rounded px-1 transition-colors' : ''} truncate text-base font-semibold ${task.completed ? 'line-through text-muted-foreground' : 'text-gray-900 dark:text-white'}`}
                title={onUpdate ? 'Kliknij, aby edytować tytuł' : undefined}
              >
                {task.title}
              </h3>
            )}
          </div>
          <button
            onClick={event => {
              event.stopPropagation()
              if (completionBlocked || saving) return
              onComplete()
            }}
            disabled={completionBlocked || saving}
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
              task.completed
                ? 'border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400'
                : completionBlocked
                  ? 'cursor-not-allowed border-amber-200 bg-amber-50 text-amber-500 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300'
                : 'border-gray-200 text-gray-400 hover:border-green-300 hover:text-green-600 dark:border-gray-700 dark:text-gray-500'
            }`}
            title={completionTitle}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {/* Priority — inline editable */}
          {editingField === 'priority' ? (
            <div ref={dropdownRef} className="relative" onClick={e => e.stopPropagation()}>
              <div className="flex gap-1 rounded-lg border border-border bg-card p-1 shadow-lg">
                {(Object.entries(priorityConfig) as [Task['priority'], typeof priorityConfig['high']][]).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => void changePriority(key)}
                    disabled={saving}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                      key === task.priority
                        ? `${cfg.className} ring-2 ring-primary/30`
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <span
              onClick={e => {
                e.stopPropagation()
                if (onUpdate && !saving) setEditingField('priority')
              }}
              className={`badge cursor-pointer transition-all hover:ring-2 hover:ring-primary/30 ${priority.className}`}
              title={onUpdate ? 'Kliknij, aby zmienić priorytet' : undefined}
            >
              {priority.label}
              {onUpdate && <span className="ml-1 opacity-0 group-hover:opacity-60 transition-opacity">▼</span>}
            </span>
          )}

          <span className={`badge ${status.className}`}>{status.label}</span>
          {blocked && (
            <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              Zablokowane: {task.blocked_by.length}
            </span>
          )}
          {hasOpenSubtasks && (
            <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              Podzadania: {openSubtasks}
            </span>
          )}
          {task.due_date && (
            <span className={`badge ${isOverdue(task.due_date, task.completed)
              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
              {isOverdue(task.due_date, task.completed) ? 'Po terminie' : 'Termin'}: {formatDate(task.due_date)}
            </span>
          )}
        </div>

        {/* Assignees — inline editable */}
        <div className="relative mb-3 flex min-h-[1.75rem] items-center gap-1.5">
          {editingField === 'assignee' ? (
            <div ref={dropdownRef} className="relative" onClick={e => e.stopPropagation()}>
              <div className="rounded-lg border border-border bg-card p-1 shadow-lg min-w-[200px]">
                {usersLoading ? (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span className="text-xs text-muted-foreground">Ładowanie...</span>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => void changeAssignee(null)}
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
                          onClick={() => void changeAssignee(user.id)}
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
            <div
              onClick={e => {
                e.stopPropagation()
                if (onUpdate && !saving) setEditingField('assignee')
              }}
              className={`flex items-center gap-1.5 ${onUpdate ? 'cursor-pointer rounded-md px-1 -ml-1 hover:bg-muted/50 transition-colors' : ''}`}
              title={onUpdate ? 'Kliknij, aby zmienić wykonawcę' : undefined}
            >
              {task.assignees.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  Nieprzypisane
                  {onUpdate && <span className="ml-1 opacity-0 group-hover:opacity-60 transition-opacity">▼</span>}
                </span>
              ) : (
                <>
                  {task.assignees.slice(0, 2).map(assignee => (
                    <span key={assignee.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold">
                        {assignee.username.charAt(0).toUpperCase()}
                      </span>
                      {assignee.username}
                    </span>
                  ))}
                  {task.assignees.length > 2 && (
                    <span className="text-xs text-muted-foreground">+{task.assignees.length - 2}</span>
                  )}
                  {onUpdate && <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-60 transition-opacity">▼</span>}
                </>
              )}
            </div>
          )}

          {saving && editingField === null && (
            <span className="ml-1 h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
        </div>

        {task.subtasks.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Postęp podzadań</span>
              <span>{completedSubtasks}/{task.subtasks.length}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(completedSubtasks / task.subtasks.length) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}


