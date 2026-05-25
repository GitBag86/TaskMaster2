import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/api/client'
import type { Team } from '@/types'
import { useToast } from '@/store/ToastContext'
import { AdminSkeleton } from '@/components/common/Skeletons'

export default function TeamsAdminPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const loadTeams = useCallback(async () => {
    try {
      const response = await api.teams.list();
      setTeams(response.teams);
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd ładowania zespołów', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  if (loading) return <AdminSkeleton />;

  return (
    <div className="space-y-4 page-enter">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Zespoły</h2>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-border bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Nazwa</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Slug</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Członkowie</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Utworzono</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {teams.map(team => (
                <tr key={team.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <Link to={`/admin/teams/${team.id}`} className="font-medium text-primary hover:underline">
                      {team.name}
                    </Link>
                    {team.description && (
                      <p className="mt-0.5 max-w-md truncate text-xs text-muted-foreground">{team.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{team.slug}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{team.stats?.members ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${
                      team.archived
                        ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                        : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    }`}>
                      {team.archived ? 'Archiwum' : 'Aktywny'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {team.created_at ? new Date(team.created_at).toLocaleDateString('pl-PL') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {teams.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">Brak zespołów.</div>
        )}
      </div>
    </div>
  );
}
