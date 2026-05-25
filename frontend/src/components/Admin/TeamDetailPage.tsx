import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '@/api/client'
import type { Team, TeamAuditEntry, User } from '@/types'
import { useToast } from '@/store/ToastContext'
import { AdminSkeleton } from '@/components/common/Skeletons'

export default function TeamDetailPage() {
  const { id } = useParams();
  const teamId = Number(id);
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [audit, setAudit] = useState<TeamAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const loadTeam = useCallback(async () => {
    if (!Number.isFinite(teamId)) return;
    try {
      const [membersResponse, auditResponse] = await Promise.all([
        api.teams.members(teamId),
        api.teams.audit(teamId),
      ]);
      setTeam(membersResponse.team);
      setMembers(membersResponse.members);
      setAudit(auditResponse.audit);
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd ładowania zespołu', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, teamId]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  if (loading) return <AdminSkeleton />;

  return (
    <div className="space-y-4 page-enter">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/admin/teams" className="text-sm font-medium text-primary hover:underline">Zespoły</Link>
          <h2 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{team?.name ?? 'Zespół'}</h2>
        </div>
        {team && (
          <span className={`badge ${
            team.archived
              ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          }`}>
            {team.archived ? 'Archiwum' : 'Aktywny'}
          </span>
        )}
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-border p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">Członkowie</h3>
        </div>
        <div className="divide-y divide-border">
          {members.map(member => (
            <div key={member.id} className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{member.username}</p>
                <p className="text-sm text-muted-foreground">{member.email}</p>
              </div>
              <span className="badge bg-primary/10 text-primary">{member.role}</span>
            </div>
          ))}
          {members.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">Brak członków.</div>
          )}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-border p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">Audyt</h3>
        </div>
        <div className="divide-y divide-border">
          {audit.slice(0, 20).map(entry => (
            <div key={entry.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-gray-900 dark:text-white">{entry.action}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.created_at ? new Date(entry.created_at).toLocaleString('pl-PL') : ''}
                </p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{entry.actor ?? 'System'}</p>
            </div>
          ))}
          {audit.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">Brak wpisów audytu.</div>
          )}
        </div>
      </section>
    </div>
  );
}
