import { useMemo, useRef, useState } from 'react'
import type { InviteToken } from '@/types'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

type InviteFormProps = {
  onCreated: (invite: InviteToken) => void;
};

export default function InviteForm({ onCreated }: InviteFormProps) {
  const [email, setEmail] = useState('');
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { addToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null)

  const emailError = useMemo(() => {
    const trimmed = email.trim()
    if (!trimmed) return ''  // empty is allowed (optional)
    if (!EMAIL_REGEX.test(trimmed)) return 'Nieprawidłowy format adresu email'
    return ''
  }, [email])

  const canSubmit = !creating && !emailError

  const signupLink = useMemo(() => {
    if (!rawToken || typeof window === 'undefined') return '';
    return `${window.location.origin}/auth?token=${encodeURIComponent(rawToken)}`;
  }, [rawToken]);

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    setDirty(true)
    if (emailError) {
      inputRef.current?.focus()
      return
    }
    setCreating(true);
    try {
      const invite = await api.invites.create(email.trim() || undefined);
      setRawToken(invite.raw_token ?? null);
      setEmail('');
      setDirty(false)
      onCreated(invite);
      addToast('Zaproszenie utworzone', 'success');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd tworzenia zaproszenia', 'error');
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async () => {
    if (!signupLink) return;
    try {
      await navigator.clipboard.writeText(signupLink);
      addToast('Link skopiowany', 'success');
    } catch {
      addToast('Nie udało się skopiować linku', 'warning');
    }
  };

  return (
    <form onSubmit={createInvite} noValidate className="card p-4">
      <div className="mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white">Nowe zaproszenie</h3>
        <p className="text-sm text-muted-foreground">Rola zaproszonej osoby: user.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="relative">
          <input
            ref={inputRef}
            type="email"
            value={email}
            onChange={event => {
              setEmail(event.target.value)
              setDirty(true)
            }}
            onBlur={() => setDirty(true)}
            className={`input ${dirty && emailError ? 'border-destructive focus-visible:ring-destructive/50' : ''}`}
            placeholder="E-mail opcjonalnie"
            aria-invalid={dirty && !!emailError}
            aria-describedby={dirty && emailError ? 'email-error' : undefined}
          />
          {dirty && emailError && (
            <p id="email-error" className="mt-1 text-xs text-destructive" role="alert">
              {emailError}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="btn btn-primary whitespace-nowrap disabled:opacity-50"
        >
          {creating ? 'Tworzenie...' : 'Wygeneruj'}
        </button>
      </div>

      {rawToken && (
        <div className="mt-4 space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <div>
            <p className="mb-1 text-sm font-medium text-gray-900 dark:text-white">Token widoczny tylko raz</p>
            <code className="block overflow-x-auto rounded-md bg-background p-3 text-sm text-gray-900 dark:text-gray-100">
              {rawToken}
            </code>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-gray-900 dark:text-white">Link rejestracyjny</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={signupLink} readOnly className="input flex-1" />
              <button type="button" onClick={() => void copyLink()} className="btn btn-secondary">
                Kopiuj
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
