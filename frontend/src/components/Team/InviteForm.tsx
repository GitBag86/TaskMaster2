import { useMemo, useState } from 'react'
import type { InviteToken } from '@/types'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'

type InviteFormProps = {
  onCreated: (invite: InviteToken) => void;
};

export default function InviteForm({ onCreated }: InviteFormProps) {
  const [email, setEmail] = useState('');
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { addToast } = useToast();

  const signupLink = useMemo(() => {
    if (!rawToken || typeof window === 'undefined') return '';
    return `${window.location.origin}/auth?token=${encodeURIComponent(rawToken)}`;
  }, [rawToken]);

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      const invite = await api.invites.create(email.trim() || undefined);
      setRawToken(invite.raw_token ?? null);
      setEmail('');
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
    <form onSubmit={createInvite} className="card p-4">
      <div className="mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white">Nowe zaproszenie</h3>
        <p className="text-sm text-muted-foreground">Rola zaproszonej osoby: user.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <input
          type="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          className="input"
          placeholder="E-mail opcjonalnie"
        />
        <button type="submit" disabled={creating} className="btn btn-primary whitespace-nowrap">
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
