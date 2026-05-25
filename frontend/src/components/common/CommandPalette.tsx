import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useNavigate, type NavigateFunction } from 'react-router-dom'
import type { Task } from '@/types'
import { api } from '@/api/client'
import { useAuth } from '@/store/AuthContext'
import { useTheme } from '@/store/ThemeContext'
import { useToast } from '@/store/ToastContext'

type Command = {
  id: string;
  label: string;
  description: string;
  run: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Task[]>([])
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toggle } = useTheme()
  const { addToast } = useToast()
  const quickAddText = query.trim().startsWith('+') ? query.trim().slice(1).trim() : ''

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(prev => !prev)
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

    if (user.role === 'super_admin') {
      baseCommands.push({
        id: 'theme',
        label: 'Przełącz motyw',
        description: 'Zmiana jasny/ciemny',
        run: () => {
          toggle()
          setOpen(false)
        },
      })
    }

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

  if (!user || !open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 p-4" onClick={() => setOpen(false)}>
      <div
        className="mx-auto mt-16 w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="border-b border-border p-3">
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && quickAddText) {
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
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-muted/60"
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
              {filteredCommands.map(command => (
                <button
                  key={command.id}
                  onClick={command.run}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-muted/60"
                >
                  <span>
                    <span className="block text-sm font-medium text-gray-900 dark:text-white">{command.label}</span>
                    <span className="block text-xs text-muted-foreground">{command.description}</span>
                  </span>
                </button>
              ))}
            </section>
          )}

          {results.length > 0 && (
            <section>
              <p className="px-2 py-1 text-[11px] font-semibold uppercase text-muted-foreground">Zadania</p>
              {results.map(task => (
                <button
                  key={task.id}
                  onClick={() => {
                    navigate('/')
                    setOpen(false)
                    addToast(`Znaleziono: ${task.title}`, 'info')
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-muted/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{task.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{task.project}</span>
                  </span>
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {priorityLabel(task.priority)}
                  </span>
                </button>
              ))}
            </section>
          )}

          {filteredCommands.length === 0 && results.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Brak wyników.</p>
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

function priorityLabel(priority: Task['priority']) {
  return priority === 'high' ? 'Wysoki' : priority === 'medium' ? 'Średni' : 'Niski'
}
