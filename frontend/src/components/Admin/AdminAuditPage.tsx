import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api/client'
import type { TeamAuditEntry } from '@/types'
import { useToast } from '@/store/ToastContext'
import { ActivitySkeleton } from '@/components/common/Skeletons'

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<TeamAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const loadAudit = useCallback(async () => {
    try {
      const response = await api.teams.globalAudit();
      setEntries(response.audit);
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd ładowania audytu', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  if (loading) return <ActivitySkeleton />;

  return (
    <div className="space-y-4 page-enter">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Audyt</h2>
      <div className="space-y-2">
        {entries.map(entry => (
          <div key={entry.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-gray-900 dark:text-white">{entry.action}</span>
              <span className="text-xs text-muted-foreground">
                {entry.created_at ? new Date(entry.created_at).toLocaleString('pl-PL') : ''}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>actor: {entry.actor ?? entry.actor_id}</span>
              {entry.target_team_id !== null && <span>team: {entry.target_team_id}</span>}
              {entry.target_user_id !== null && <span>user: {entry.target_user_id}</span>}
            </div>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="card p-8 text-center text-sm text-muted-foreground">Brak wpisów audytu.</div>
        )}
      </div>
    </div>
  );
}
