import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '@/api/client'
import type { Role, Team, TeamAuditEntry, User } from '@/types'
import { useToast } from '@/store/ToastContext'
import { AdminSkeleton } from '@/components/common/Skeletons'

export default function TeamDetailPage() {
  const { id } = useParams();
  const teamId = Number(id);
  const [team, setTeam] = useState<Team | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [audit, setAudit] = useState<TeamAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [moveTargets, setMoveTargets] = useState<Record<number, string>>({});
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'manager'>('user');
  const [creating, setCreating] = useState(false);
  const { addToast } = useToast();

  const moveOptions = useMemo(
    () => teams.filter(item => item.id !== teamId && !item.archived),
    [teamId, teams],
  );

  const loadTeam = useCallback(async () => {
    if (!Number.isFinite(teamId)) return;
    try {
      const [membersResponse, auditResponse, teamsResponse] = await Promise.all([
        api.teams.members(teamId),
        api.teams.audit(teamId),
        api.teams.list(),
      ]);
      setTeam(membersResponse.team);
      setMembers(membersResponse.members);
      setAudit(auditResponse.audit);
      setTeams(teamsResponse.teams);
      const nextMoveOptions = teamsResponse.teams.filter(item => item.id !== teamId && !item.archived);
      setMoveTargets(prev => {
        const next = { ...prev };
        membersResponse.members.forEach(member => {
          if (!next[member.id] && nextMoveOptions.length > 0) {
            next[member.id] = String(nextMoveOptions[0].id);
          }
        });
        return next;
      });
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd ładowania zespołu', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, teamId]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  const toggleArchive = async () => {
    if (!team) return;
    setActionKey('archive');
    try {
      const response = await api.teams.archive(team.id, !team.archived);
      setTeam(response.team);
      await loadTeam();
      addToast(team.archived ? 'Zespół przywrócony' : 'Zespół zarchiwizowany', 'success');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd zmiany statusu zespołu', 'error');
    } finally {
      setActionKey(null);
    }
  };

  const changeRole = async (member: User) => {
    const role: Role = member.role === 'manager' ? 'user' : 'manager';
    setActionKey(`role:${member.id}`);
    try {
      await api.teams.updateUserRole(member.id, role, member.team_id);
      await loadTeam();
      addToast(role === 'manager' ? 'Użytkownik awansowany' : 'Użytkownik zdegradowany', 'success');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd zmiany roli', 'error');
    } finally {
      setActionKey(null);
    }
  };

  const moveUser = async (member: User) => {
    const targetTeamId = Number(moveTargets[member.id]);
    if (!targetTeamId || targetTeamId === teamId) return;

    setActionKey(`move:${member.id}`);
    try {
      await api.teams.moveUser(member.id, targetTeamId);
      await loadTeam();
      addToast('Użytkownik przeniesiony', 'success');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd przenoszenia użytkownika', 'error');
    } finally {
      setActionKey(null);
    }
  };

  const deleteMember = async (member: User) => {
    const confirmed = window.confirm(
      `Usunąć użytkownika ${member.username} wraz ze wszystkimi jego danymi (zadaniami, komentarzami, ustawieniami)? Tej operacji nie można cofnąć.`,
    );
    if (!confirmed) return;

    setActionKey(`delete:${member.id}`);
    try {
      await api.teams.deleteUser(member.id);
      await loadTeam();
      addToast('Użytkownik usunięty', 'success');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd usuwania użytkownika', 'error');
    } finally {
      setActionKey(null);
    }
  };

  const handleCreateMember = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!team || team.archived) return;
    setCreating(true);
    try {
      await api.teams.addMember(team.id, {
        username: newUsername.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      });
      addToast('Użytkownik dodany do zespołu', 'success');
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('user');
      await loadTeam();
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd dodawania użytkownika', 'error');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <AdminSkeleton />;

  return (
    <div className="space-y-4 page-enter">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/admin/teams" className="text-sm font-medium text-primary hover:underline">Zespoły</Link>
          <h2 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{team?.name ?? 'Zespół'}</h2>
          {team?.description && (
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{team.description}</p>
          )}
        </div>
        {team && (
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge archived={team.archived} />
            <button
              type="button"
              onClick={() => void toggleArchive()}
              disabled={actionKey === 'archive'}
              className="btn btn-secondary btn-sm"
            >
              {team.archived ? 'Przywróć' : 'Archiwizuj'}
            </button>
          </div>
        )}
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-border p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">Dodaj członka</h3>
          <p className="text-sm text-muted-foreground">Utwórz konto i przypisz je do tego zespołu.</p>
        </div>
        <form onSubmit={handleCreateMember} className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_180px_auto]">
          <input
            type="text"
            value={newUsername}
            onChange={e => setNewUsername(e.target.value)}
            className="input"
            placeholder="Nazwa użytkownika"
            minLength={3}
            required
          />
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            className="input"
            placeholder="E-mail"
            required
          />
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="input"
            placeholder="Hasło"
            minLength={6}
            required
          />
          <select value={newRole} onChange={e => setNewRole(e.target.value as 'user' | 'manager')} className="input">
            <option value="user">Użytkownik</option>
            <option value="manager">Manager</option>
          </select>
          <button
            type="submit"
            disabled={creating || (team?.archived ?? false)}
            className="btn btn-primary whitespace-nowrap"
          >
            {creating ? 'Dodawanie...' : 'Dodaj'}
          </button>
        </form>
        {team?.archived && (
          <p className="px-4 pb-4 text-sm text-amber-600 dark:text-amber-400">
            Nie można dodawać członków do zarchiwizowanego zespołu.
          </p>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-border p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">Członkowie</h3>
        </div>
        {/* Mobile card view */}
        <div className="divide-y divide-border sm:hidden">
          {members.map(member => {
            const roleBusy = actionKey === `role:${member.id}`;
            const moveBusy = actionKey === `move:${member.id}`;
            const deleteBusy = actionKey === `delete:${member.id}`;
            const selectedTarget = moveTargets[member.id] ?? (moveOptions[0] ? String(moveOptions[0].id) : '');

            return (
              <div key={member.id} className="p-3">
                <div className="mb-2">
                  <p className="font-medium text-gray-900 dark:text-white">{member.username}</p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                </div>
                <div className="mb-2 flex items-center gap-2">
                  <span className={`badge ${member.role === 'manager' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                    {member.role === 'manager' ? 'Manager' : 'User'}
                  </span>
                  <select
                    value={selectedTarget}
                    onChange={event => setMoveTargets(prev => ({ ...prev, [member.id]: event.target.value }))}
                    disabled={moveOptions.length === 0}
                    className="input h-8 flex-1 text-xs"
                  >
                    {moveOptions.length === 0 ? (
                      <option value="">Brak aktywnych zespołów</option>
                    ) : (
                      moveOptions.map(option => (
                        <option key={option.id} value={option.id}>{option.name}</option>
                      ))
                    )}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void changeRole(member)} disabled={roleBusy} className="btn btn-secondary btn-sm">{member.role === 'manager' ? 'Degraduj' : 'Awansuj'}</button>
                  <button type="button" onClick={() => void moveUser(member)} disabled={!selectedTarget || moveBusy} className="btn btn-primary btn-sm">Przenieś</button>
                  <button type="button" onClick={() => void deleteMember(member)} disabled={deleteBusy} className="btn btn-destructive btn-sm">Usuń</button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="border-b border-border bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Użytkownik</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Rola</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Przenieś do</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map(member => {
                const roleBusy = actionKey === `role:${member.id}`;
                const moveBusy = actionKey === `move:${member.id}`;
                const deleteBusy = actionKey === `delete:${member.id}`;
                const selectedTarget = moveTargets[member.id] ?? (moveOptions[0] ? String(moveOptions[0].id) : '');

                return (
                  <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-white">{member.username}</p>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${
                        member.role === 'manager'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                      }`}>
                        {member.role === 'manager' ? 'Manager' : 'User'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={selectedTarget}
                        onChange={event => setMoveTargets(prev => ({ ...prev, [member.id]: event.target.value }))}
                        disabled={moveOptions.length === 0}
                        className="input h-9 max-w-[260px]"
                      >
                        {moveOptions.length === 0 ? (
                          <option value="">Brak aktywnych zespołów</option>
                        ) : (
                          moveOptions.map(option => (
                            <option key={option.id} value={option.id}>{option.name}</option>
                          ))
                        )}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void changeRole(member)}
                          disabled={roleBusy}
                          className="btn btn-secondary btn-sm"
                        >
                          {member.role === 'manager' ? 'Degraduj' : 'Awansuj'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void moveUser(member)}
                          disabled={!selectedTarget || moveBusy}
                          className="btn btn-primary btn-sm"
                        >
                          Przenieś
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteMember(member)}
                          disabled={deleteBusy}
                          className="btn btn-destructive btn-sm"
                        >
                          Usuń
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {members.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">Brak członków.</div>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-border p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">Audyt</h3>
        </div>
        <div className="divide-y divide-border">
          {audit.slice(0, 40).map(entry => (
            <div key={entry.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-gray-900 dark:text-white">{entry.action}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.created_at ? new Date(entry.created_at).toLocaleString('pl-PL') : ''}
                </p>
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-sm text-muted-foreground">
                <span>{entry.actor ?? 'System'}</span>
                {entry.target_user_id !== null && <span>user #{entry.target_user_id}</span>}
                {entry.source_team_id !== null && <span>z teamu #{entry.source_team_id}</span>}
              </div>
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

function StatusBadge({ archived }: { archived: boolean }) {
  return (
    <span className={`badge ${
      archived
        ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
        : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    }`}>
      {archived ? 'Archiwum' : 'Aktywny'}
    </span>
  );
}
