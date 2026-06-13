import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'
import { useAuth } from '@/store/AuthContext'
import type { InviteToken } from '@/types'
const STEPS = [
  'Witaj',
  'Projekt',
  'Zaproszenie',
  'Zadanie',
  'Gotowe',
] as const

const ONBOARDING_KEY = 'taskmaster2_onboarding_done'

/** Check if onboarding has been completed (localStorage). */
export function isOnboardingDone(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'true'
  } catch {
    return false
  }
}

/** Mark onboarding as completed. */
export function completeOnboarding(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(ONBOARDING_KEY, 'true')
  } catch {
    // localStorage unavailable (private browsing, quota exceeded) — non-fatal
  }
}

export default function OnboardingWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [quickAddText, setQuickAddText] = useState('')
  const [busy, setBusy] = useState(false)
  const { addToast } = useToast()
  const { user } = useAuth()
  const navigate = useNavigate()

  const createProject = useCallback(async () => {
    const name = projectName.trim()
    if (!name) return
    setBusy(true)
    try {
      await api.projects.create({
        name,
        description: projectDescription.trim(),
        color: '#6366f1',
      })
      addToast(`Projekt „${name}” utworzony`, 'success')
      setStep(2)
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd tworzenia projektu', 'error')
    } finally {
      setBusy(false)
    }
  }, [projectName, projectDescription, addToast])

  const skipProject = useCallback(() => {
    setProjectName('')
    setProjectDescription('')
    setStep(2)
  }, [])

  const createInvite = useCallback(async () => {
    setBusy(true)
    try {
      const invite: InviteToken = await api.invites.create()
      const link = `${window.location.origin}/auth?token=${encodeURIComponent(invite.raw_token ?? '')}`
      setInviteLink(link)
      addToast('Link zaproszenia wygenerowany', 'success')
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd generowania zaproszenia', 'error')
    } finally {
      setBusy(false)
    }
  }, [addToast])

  const skipInvite = useCallback(() => {
    setInviteLink('')
    setStep(3)
  }, [])

  const createTask = useCallback(async () => {
    if (!quickAddText.trim()) {
      setStep(4)
      return
    }
    setBusy(true)
    try {
      const response = await api.tasks.quickAdd(quickAddText.trim())
      addToast(`Dodano zadanie: ${response.task.title}`, 'success')
      setStep(4)
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd dodawania zadania', 'error')
      setStep(4) // Proceed even on error
    } finally {
      setBusy(false)
    }
  }, [quickAddText, addToast])

  const copyLink = useCallback(async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      addToast('Link skopiowany', 'success')
    } catch {
      addToast('Nie udało się skopiować linku', 'warning')
    }
  }, [inviteLink, addToast])

  const finish = useCallback((path?: string) => {
    completeOnboarding()
    onDone()
    navigate(path ?? '/')
  }, [onDone, navigate])

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-gradient-to-br from-indigo-500/90 to-purple-600/90 p-4 dark:from-gray-900/95 dark:to-gray-800/95">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl dark:bg-gray-900">
        {/* Step indicator */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                  i <= step
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {i < step ? '✓' : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-0.5 w-8 transition-colors ${
                    i < step ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Witaj w TaskMaster, {user?.username || ''}!
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Jesteś administratorem swojego zespołu. Ten krótki przewodnik pomoże Ci
                skonfigurować przestrzeń pracy.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-left text-sm">
              <h3 className="mb-2 font-semibold text-gray-900 dark:text-white">
                W kilku krokach:
              </h3>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-primary">1.</span>
                  <span>Stwórz pierwszy projekt</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-primary">2.</span>
                  <span>Zaproś członków zespołu</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-primary">3.</span>
                  <span>Dodaj pierwsze zadanie</span>
                </li>
              </ul>
            </div>
            <button onClick={() => setStep(1)} className="btn btn-primary w-full btn-sm">
              Rozpocznij
            </button>
          </div>
        )}

        {/* Step 1: Create Project */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
              </div>
              <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
                Stwórz pierwszy projekt
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Projekty grupują zadania w jednym miejscu.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Nazwa projektu *
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  className="input"
                  placeholder="np. Strona WWW, Aplikacja mobilna..."
                  onKeyDown={e => e.key === 'Enter' && !busy && projectName.trim() && void createProject()}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Opis (opcjonalnie)
                </label>
                <textarea
                  value={projectDescription}
                  onChange={e => setProjectDescription(e.target.value)}
                  className="input min-h-[80px]"
                  placeholder="Krótki opis celu projektu..."
                  maxLength={500}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={skipProject} className="btn btn-ghost btn-sm flex-1">
                Pomiń
              </button>
              <button
                onClick={() => void createProject()}
                disabled={busy || !projectName.trim()}
                className="btn btn-primary btn-sm flex-1"
              >
                {busy ? 'Tworzenie...' : 'Utwórz projekt'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Invite Team */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
                Zaproś zespół
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Wygeneruj link zaproszenia i wyślij go członkom zespołu.
              </p>
            </div>

            {!inviteLink ? (
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
                <p className="mb-2 text-sm text-muted-foreground">
                  Kliknij przycisk, aby wygenerować unikalny link rejestracyjny.
                </p>
                <p className="text-xs text-muted-foreground">
                  Zaproszone osoby automatycznie dołączą do Twojego zespołu jako użytkownicy.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="mb-1 text-sm font-medium text-gray-900 dark:text-white">Link rejestracyjny</p>
                  <div className="flex gap-2">
                    <input value={inviteLink} readOnly className="input flex-1 text-xs" />
                    <button type="button" onClick={() => void copyLink()} className="btn btn-secondary btn-sm whitespace-nowrap">
                      Kopiuj
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={skipInvite} className="btn btn-ghost btn-sm flex-1">
                {inviteLink ? 'Dalej' : 'Pomiń'}
              </button>
              {!inviteLink && (
                <button
                  onClick={() => void createInvite()}
                  disabled={busy}
                  className="btn btn-primary btn-sm flex-1"
                >
                  {busy ? 'Generowanie...' : 'Generuj link'}
                </button>
              )}
              {inviteLink && (
                <button onClick={() => setStep(3)} className="btn btn-primary btn-sm flex-1">
                  Dalej
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Create Task */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
                Dodaj pierwsze zadanie
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Szybko dodaj zadanie za pomocą naturalnego języka.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Treść zadania
              </label>
              <input
                type="text"
                value={quickAddText}
                onChange={e => setQuickAddText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !busy && void createTask()}
                className="input"
                placeholder='np. + Stwórz stronę główną #WebDesign !high'
                autoFocus
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Użyj + na początku, aby szybko dodać. Możesz też pominąć ten krok.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(4)}
                className="btn btn-ghost btn-sm flex-1"
              >
                Pomiń
              </button>
              <button
                onClick={() => void createTask()}
                disabled={busy}
                className="btn btn-primary btn-sm flex-1"
              >
                {busy ? 'Dodawanie...' : quickAddText.trim() ? 'Dodaj zadanie' : 'Dalej'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 4 && (
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <svg className="h-8 w-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Wszystko gotowe!
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Podstawowa konfiguracja zakończona. Oto co możesz teraz zrobić:
              </p>
            </div>
            <div className="space-y-3 text-left">
              <ChecklistItem
                icon="📋"
                label="Przeglądaj zadania"
                description="Lista wszystkich zadań z filtrowaniem i wyszukiwaniem"
                onClick={() => finish('/')}
              />
              <ChecklistItem
                icon="📊"
                label="Tablica Kanban"
                description="Przeciągaj zadania między kolumnami statusów"
                onClick={() => finish('/kanban')}
              />
              <ChecklistItem
                icon="🗓️"
                label="Widok kalendarza"
                description="Sprawdź terminy w kalendarzu miesięcznym"
                onClick={() => finish('/calendar')}
              />
              <ChecklistItem
                icon="📈"
                label="Statystyki"
                description="Panel z metrykami i raportem tygodniowym"
                onClick={() => finish('/dashboard')}
              />
            </div>
            <button onClick={() => finish()} className="btn btn-primary w-full btn-sm">
              Rozpocznij pracę
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ChecklistItem({
  icon,
  label,
  description,
  onClick,
}: {
  icon: string
  label: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50"
    >
      <span className="text-xl">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <svg className="h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}
