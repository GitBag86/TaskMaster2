import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api/client'
import type { InviteToken } from '@/types'
import { useToast } from '@/store/ToastContext'
import { AdminSkeleton } from '@/components/common/Skeletons'

export default function TeamInvitesPage() {
  const [invites, setInvites] = useState<InviteToken[]>([]);
  const [latestToken, setLatestToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const { addToast } = useToast();

  const loadInvites = useCallback(async () => {
    try {
      const response = await api.invites.list();
      setInvites(response.invites);
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd ładowania zaproszeń', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  const createInvite = async () => {
    setCreating(true);
    try {
      const invite = await api.invites.create();
      setLatestToken(invite.raw_token ?? null);
      await loadInvites();
      addToast('Zaproszenie utworzone', 'success');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd tworzenia zaproszenia', 'error');
    } finally {
      setCreating(false);
    }
  };

  const revokeInvite = async (id: number) => {
    try {
      await api.invites.revoke(id);
      await loadInvites();
      addToast('Zaproszenie cofnięte', 'success');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd cofania zaproszenia', 'error');
    }
  };

  if (loading) return <AdminSkeleton />;

  return (
    <div className="space-y-4 page-enter">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Zaproszenia</h2>
        <button type="button" onClick={() => void createInvite()} disabled={creating} className="btn btn-primary">
          {creating ? 'Tworzenie...' : 'Nowe zaproszenie'}
        </button>
      </div>

      {latestToken && (
        <div className="card p-4">
          <p className="mb-2 text-sm font-medium text-gray-900 dark:text-white">Token</p>
          <code className="block overflow-x-auto rounded-md bg-muted p-3 text-sm text-gray-900 dark:text-gray-100">
            {latestToken}
          </code>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="divide-y divide-border">
          {invites.map(invite => (
            <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">#{invite.id}</p>
                <p className="text-sm text-muted-foreground">
                  Wygasa: {new Date(invite.expires_at).toLocaleString('pl-PL')}
                </p>
              </div>
              <button type="button" onClick={() => void revokeInvite(invite.id)} className="btn btn-destructive btn-sm">
                Cofnij
              </button>
            </div>
          ))}
          {invites.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">Brak aktywnych zaproszeń.</div>
          )}
        </div>
      </div>
    </div>
  );
}
