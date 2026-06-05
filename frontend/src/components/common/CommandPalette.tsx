import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useNavigate, type NavigateFunction } from 'react-router-dom'
import type { Task } from '@/types'
import { api } from '@/api/client'
import { useAuth } from '@/store/AuthContext'
import { useTheme } from '@/store/ThemeContext'
import { useToast } from '@/store/ToastContext'
import { priorityLabel } from '@/utils/helpers'

type Command = {
  id: string;
  label: string;
  description: string;
  run: () => void;
}

const COMMAND_ICONS: Record<string, string> = {
  tasks: '📋',
  today: '📅',
  projects: '📁',
  calendar: '🗓️',
  kanban: '📊',
  dashboard: '📈',
  activity: '📝',
  members: '👥',
  invites: '✉️',
  teams: '🏢',
  audit: '🔍',
  theme: '🎨',
  export: '⬇️',
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Task[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toggle } = useTheme()
  const { addToast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const quickAddText = query.trim().startsWith('+') ? query.trim().slice(1).trim() : ''

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(prev => !prev)
        setSelectedIndex(0)
        setQuery('')
      }
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!open || user?.role === 'super_admin' || query.trim().length < 2 || query.trim().startsWith('+')) {
      setResults([])
      return
    }

    const timeout = window.setTimeout(async () => {
      try {
        const response = await api.tasks.search(query.trim())
        setResults(response.tasks.slice(0, 6))
      } catch {
        setResults([])
      }
    }, 180)

    return () => window.clearTimeout(timeout)
  }, [open, query, user?.role])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleQuickAdd = useCallback(async () => {
    if (!quickAddText || user?.role !== 'manager') return
    try {
      const response = await api.tasks.quickAdd(quickAddText)
      addToast(`Dodano: ${response.task.title}`, 'success')
      setQuery('')
      setOpen(false)
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd szybkiego dodawania', 'error')
    }
  }, [addToast, quickAddText, user?.role])

  const commands = useMemo<Command[]>(() => {
    if (!user) return []

    const baseCommands: Command[] = user.role === 'super_admin' ? [
      navCommand('teams', 'Zespoły', 'Lista workspaceów', '/admin/teams', navigate, setOpen),
      navCommand('audit', 'Audyt', 'Dziennik administracyjny', '/admin/audit', navigate, setOpen),
      {
        id: 'export',
        label: 'Eksport CSV',
        description: 'Pobierz dane jako CSV',
        run: () => {
          window.location.href = '/tasks/export/csv'
          setOpen(false)
        },
      },
    ] : [
      navCommand('tasks', 'Zadania', 'Przejdź do listy zadań', '/', navigate, setOpen),
      navCommand('today', 'Dziś', 'Najbliższe terminy i zaległości', '/today', navigate, setOpen),
      navCommand('projects', 'Projekty', 'Przegląd projektów i przypisywanie zadań', '/projects', navigate, setOpen),
      navCommand('calendar', 'Kalendarz', 'Widok terminów w miesiącu', '/calendar', navigate, setOpen),
      navCommand('kanban', 'Kanban', 'Tablica statusów', '/kanban', navigate, setOpen),
      navCommand('dashboard', 'Statystyki', 'Panel metryk i postępu', '/dashboard', navigate, setOpen),
      navCommand('activity', 'Aktywność', 'Ostatnie zdarzenia w aplikacji', '/activity', navigate, setOpen),
      {
        id: 'theme',
        label: 'Przełącz motyw',
        description: 'Zmiana jasny/ciemny',
        run: () => {
          toggle()
          setOpen(false)
        },
      },
      {
        id: 'export',
        label: 'Eksport CSV',
        description: 'Pobierz zadania jako CSV',
        run: () => {
          window.location.href = '/tasks/export/csv'
          setOpen(false)
        },
      },
    ]

    if (user.role === 'manager') {
      baseCommands.push(
        navCommand('members', 'Członkowie zespołu', 'Zarządzanie kontami', '/team/members', navigate, setOpen),
        navCommand('invites', 'Zaproszenia', 'Aktywne tokeny rejestracji', '/team/invites', navigate, setOpen),
      )
    }

    return baseCommands
  }, [navigate, toggle, user])

  const filteredCommands = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return commands
    return commands.filter(command =>
      `${command.label} ${command.description}`.toLowerCase().includes(needle)
    )
  }, [commands, query])

  const totalItems = useMemo(() => {
    let total = 0
    if (user?.role === 'manager' && quickAddText) total += 1
    total += filteredCommands.length
    total += results.length
    return total
  }, [quickAddText, filteredCommands.length, results.length, user?.role])

  const handleKeyNavigation = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, totalItems - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (event.key === 'Enter' && !quickAddText) {
      event.preventDefault()
      let idx = 0
      if (user?.role === 'manager' && quickAddText) {
        if (selectedIndex === 0) {
          void handleQuickAdd()
          return
        }
        idx += 1
      }
      const cmdIdx = selectedIndex - idx
      if (cmdIdx >= 0 && cmdIdx < filteredCommands.length) {
        filteredCommands[cmdIdx].run()
        return
      }
      idx += filteredCommands.length
      const taskIdx = selectedIndex - idx
      if (taskIdx >= 0 && taskIdx < results.length) {
        navigate('/')
        setOpen(false)
        addToast(`Znaleziono: ${results[taskIdx].title}`, 'info')
      }
    }
  }, [totalItems, selectedIndex, quickAddText, user?.role, filteredCommands, results, navigate, addToast, handleQuickAdd])

  if (!user || !open) {
    return null
  }

  let itemIndex = 0

  const isSelected = (type: 'quickadd' | 'command' | 'task', index: number) => {
    let calculated = 0
    if (type === 'quickadd') calculated = 0
    else if (type === 'command') calculated = (user?.role === 'manager' && quickAddText ? 1 : 0) + index
    else if (type === 'task') calculated = (user?.role === 'manager' && quickAddText ? 1 : 0) + filteredCommands.length + index
    return selectedIndex === calculated
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 p-4" onClick={() => setOpen(false)}>
      <div
        className="mx-auto mt-16 w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="border-b border-border p-3">
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if ((event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowUp') && totalItems > 0) {
                handleKeyNavigation(event)
              } else if (event.key === 'Enter' && quickAddText) {
                event.preventDefault()
                void handleQuickAdd()
              }
            }}
            placeholder="Szukaj albo wpisz + Zadanie #Projekt @osoba jutro !high"
            className="input"
            autoFocus
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {user.role === 'manager' && quickAddText && (
            <section className="mb-2">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">Szybkie dodawanie</p>
              <button
                onClick={() => void handleQuickAdd()}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors ${isSelected('quickadd', 0) ? 'bg-primary/15 ring-1 ring-primary/30' : 'hover:bg-muted/60'}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">Dodaj zadanie</span>
                  <span className="block truncate text-xs text-muted-foreground">{quickAddText}</span>
                </span>
                <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Enter</span>
              </button>
            </section>
          )}

          {filteredCommands.length > 0 && (
            <section className="mb-2">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">Komendy</p>
              {filteredCommands.map(command => {
                const idx = itemIndex++
                return (
                  <button
                    key={command.id}
                    onClick={() => {
                      command.run()
                    }}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors ${isSelected('command', idx) ? 'bg-primary/15 ring-1 ring-primary/30' : 'hover:bg-muted/60'}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-base">{COMMAND_ICONS[command.id] ?? '•'}</span>
                      <span>
                        <span className="block text-sm font-medium text-gray-900 dark:text-white">{command.label}</span>
                        <span className="block text-xs text-muted-foreground">{command.description}</span>
                      </span>
                    </span>
                  </button>
                )
              })}
            </section>
          )}

          {results.length > 0 && (
            <section>
              <p className="px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">Zadania</p>
              {results.map(task => {
                const idx = itemIndex++
                return (
                  <button
                    key={task.id}
                    onClick={() => {
                      navigate('/')
                      setOpen(false)
                      addToast(`Znaleziono: ${task.title}`, 'info')
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors ${isSelected('task', idx) ? 'bg-primary/15 ring-1 ring-primary/30' : 'hover:bg-muted/60'}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{task.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{task.project}</span>
                    </span>
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {priorityLabel(task.priority)}
                    </span>
                  </button>
                )
              })}
            </section>
          )}

          {filteredCommands.length === 0 && results.length === 0 && !quickAddText && (
            <div className="flex flex-col items-center px-3 py-10 text-center">
              <svg className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-sm text-muted-foreground">Brak wyników. Wpisz fragment nazwy zadania lub + aby dodać.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function navCommand(
  id: string,
  label: string,
  description: string,
  path: string,
  navigate: NavigateFunction,
  setOpen: Dispatch<SetStateAction<boolean>>,
): Command {
  return {
    id,
    label,
    description,
    run: () => {
      navigate(path)
      setOpen(false)
    },
  }
}


