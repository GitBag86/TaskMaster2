import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Team, User } from '@/types'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'
import { useAuth } from '@/store/AuthContext'
import { AdminSkeleton } from '@/components/common/Skeletons'

type ManageableRole = 'manager' | 'user';

function formatId(id: number) {
  return `#${String(id).padStart(3, '0')}`;
}

function formatTimestamp(value: string | null) {
  if (!value) return 'never synced';
  const date = new Date(value);
  return date.toLocaleString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function roleLabel(role: User['role']) {
  if (role === 'super_admin') return 'ROOT';
  if (role === 'manager') return 'MANAGER';
  return 'USER';
}

function roleClass(role: User['role']) {
  if (role === 'super_admin') {
    return 'border-red-500/30 bg-red-500/10 text-red-300 shadow-red-500/10';
  }
  if (role === 'manager') {
    return 'border-purple-500/30 bg-purple-500/10 text-purple-300 shadow-purple-500/10';
  }
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 shadow-emerald-500/10';
}

function teamLabel(user: User) {
  return user.team?.name ?? (user.team_id ? `team #${user.team_id}` : 'ROOT');
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<ManageableRole>('user');
  const [newTeamId, setNewTeamId] = useState('');
  const { addToast } = useToast();
  const { user: currentUser } = useAuth();

  const teamOptions = useMemo(
    () => teams.filter(team => !team.archived),
    [teams],
  );

  const selectedTeam = useMemo(
    () => teamOptions.find(team => String(team.id) === newTeamId) ?? teamOptions[0],
    [teamOptions, newTeamId],
  );

  const stats = useMemo(() => {
    const managers = users.filter(user => user.role === 'manager').length;
    const superAdmins = users.filter(user => user.role === 'super_admin').length;
    const teamScoped = users.filter(user => user.team_id !== null).length;

    return [
      { label: 'IDENTITIES', value: users.length, hint: 'loaded identities' },
      { label: 'ROOT', value: superAdmins, hint: 'super admin accounts' },
      { label: 'MANAGERS', value: managers, hint: 'team operators' },
      { label: 'TEAM SCOPED', value: teamScoped, hint: 'bound to workspaces' },
    ];
  }, [users]);

  const latestUser = users[users.length - 1];

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [teamsResponse, meResponse] = await Promise.all([
        api.teams.list(),
        api.auth.me(),
      ]);
      const firstActiveTeamId = teamsResponse.teams.find(team => !team.archived)?.id;
      setNewTeamId(prev => prev || (firstActiveTeamId ? String(firstActiveTeamId) : ''));
      setTeams(teamsResponse.teams);

      const memberRows = await Promise.all(
        teamsResponse.teams.map(async team => {
          try {
            const response = await api.teams.members(team.id);
            return response.members.map(member => ({ ...member, team }));
          } catch {
            return [];
          }
        }),
      );

      const byId = new Map<number, User>();
      [meResponse, ...memberRows.flat()].forEach(user => byId.set(user.id, user));
      setUsers(
        Array.from(byId.values()).sort((a, b) => a.username.localeCompare(b.username)),
      );
    } catch (error: unknown) {
      addToast(error instanceof Error ? error.message : 'Błąd ładowania konsoli', 'error');
      setUsers([]);
      setTeams([]);
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTeam) {
      addToast('Wybierz aktywny zespół dla nowego użytkownika', 'error');
      return;
    }

    setSaving(true);
    try {
      await api.teams.addMember(selectedTeam.id, {
        username: newUsername.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      });
      addToast('User injected into workspace', 'success');
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      await fetchUsers();
    } catch (error: unknown) {
      addToast(error instanceof Error ? error.message : 'Error creating user', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    const target = users.find(user => user.id === userId);
    if (!confirm(`Terminate ${target?.username ?? 'user'} from the matrix?`)) return;

    try {
      await api.teams.deleteUser(userId);
      addToast('User terminated', 'success');
      await fetchUsers();
    } catch (error: unknown) {
      addToast(error instanceof Error ? error.message : 'Error deleting user', 'error');
    }
  };

  if (loading) {
    return <AdminSkeleton />;
  }

  const clock = new Date().toLocaleTimeString('pl-PL', { hour12: false });

  return (
    <div className="relative min-h-full space-y-6 overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_32rem),radial-gradient(circle_at_bottom_right,rgba(124,58,237,0.16),transparent_30rem),#020617] p-1 page-enter">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(52,211,153,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(52,211,153,0.035)_1px,transparent_1px)] bg-[size:24px_24px]"></div>

      <section className="relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-gray-950/90 p-5 shadow-2xl shadow-emerald-950/40">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.05)_1px,transparent_1px)] bg-[size:18px_18px]"></div>
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300 to-transparent"></div>
        <div className="relative grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-emerald-300">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.9)] animate-pulse"></span>
              <span className="font-mono text-xs uppercase tracking-[0.42em]">system.override // root session</span>
            </div>
            <h1 className="font-mono text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
              Super Admin Console
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-100/70 font-mono">
              Retro control panel for identity injection, workspace oversight, and audit-ready user operations.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-mono text-emerald-200/70">
              <span className="rounded border border-emerald-400/20 bg-emerald-400/10 px-2 py-1">CLOCK {clock}</span>
              <span className="rounded border border-purple-400/20 bg-purple-400/10 px-2 py-1">MODE WRITE</span>
              <span className="rounded border border-cyan-400/20 bg-cyan-400/10 px-2 py-1">SYNC LIVE</span>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-400/20 bg-black/35 p-4 font-mono">
            <div className="mb-3 flex items-center justify-between text-xs text-emerald-200/70">
              <span>last_identity</span>
              <span className="animate-pulse text-emerald-300">ONLINE</span>
            </div>
            {latestUser ? (
              <div className="space-y-1">
                <p className="truncate text-lg font-bold text-emerald-100">{latestUser.username}</p>
                <p className="text-xs text-emerald-200/60">{latestUser.email}</p>
                <p className="text-xs text-purple-200/70">{formatTimestamp(latestUser.created_at)}</p>
              </div>
            ) : (
              <p className="text-sm text-emerald-200/50">no identities loaded</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(item => (
          <div key={item.label} className="relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-gray-950/85 p-4 shadow-lg shadow-emerald-950/20">
            <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.9)] animate-pulse"></div>
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-emerald-200/60">{item.label}</p>
            <p className="mt-3 font-mono text-4xl font-black text-emerald-100">{item.value}</p>
            <p className="mt-1 text-xs text-emerald-200/50">{item.hint}</p>
          </div>
        ))}
      </section>

      <form onSubmit={handleCreateUser} className="relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-gray-950/90 p-5 shadow-2xl shadow-emerald-950/30">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(16,185,129,0.04)_1px,transparent_1px)] bg-[size:16px_16px]"></div>
        <div className="relative">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-mono text-xl font-bold text-emerald-200">&gt; create_user()</h2>
              <p className="mt-1 text-sm text-emerald-100/60">Inject a new identity into an active workspace.</p>
            </div>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 font-mono text-xs text-emerald-300">WRITE_MODE</span>
          </div>

          <div className="grid gap-3 xl:grid-cols-[1fr_1fr_1fr_180px_180px_auto]">
            <input
              type="text"
              value={newUsername}
              onChange={event => setNewUsername(event.target.value)}
              className="input bg-black/30 font-mono text-emerald-100 placeholder:text-emerald-800/60"
              placeholder="username"
              minLength={3}
              required
            />
            <input
              type="email"
              value={newEmail}
              onChange={event => setNewEmail(event.target.value)}
              className="input bg-black/30 font-mono text-emerald-100 placeholder:text-emerald-800/60"
              placeholder="email@domain"
              required
            />
            <input
              type="password"
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
              className="input bg-black/30 font-mono text-emerald-100 placeholder:text-emerald-800/60"
              placeholder="password"
              minLength={6}
              required
            />
            <select
              value={newRole}
              onChange={event => setNewRole(event.target.value as ManageableRole)}
              className="input bg-black/30 font-mono text-emerald-100"
            >
              <option value="user">user</option>
              <option value="manager">manager</option>
            </select>
            <select
              value={newTeamId}
              onChange={event => setNewTeamId(event.target.value)}
              className="input bg-black/30 font-mono text-emerald-100"
              disabled={teamOptions.length === 0}
            >
              {teamOptions.length === 0 ? (
                <option value="">no workspaces</option>
              ) : (
                teamOptions.map(team => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))
              )}
            </select>
            <button
              type="submit"
              disabled={saving || teamOptions.length === 0}
              className="btn whitespace-nowrap border border-emerald-400/30 bg-emerald-500/15 font-mono text-emerald-200 shadow-[0_0_24px_rgba(16,185,129,0.12)] hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'INJECTING...' : 'EXECUTE'}
            </button>
          </div>
        </div>
      </form>

      <section className="relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-gray-950/90 shadow-2xl shadow-emerald-950/30">
        <div className="border-b border-emerald-400/20 bg-black/30 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-500"></span>
              <span className="h-3 w-3 rounded-full bg-yellow-400"></span>
              <span className="h-3 w-3 rounded-full bg-emerald-400"></span>
              <span className="ml-2 font-mono text-sm text-emerald-200/70">identity_matrix — read/write</span>
            </div>
            <span className="rounded border border-purple-400/20 bg-purple-400/10 px-2 py-1 font-mono text-[11px] text-purple-200/80">
              {users.length} rows indexed
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] font-mono text-sm">
            <thead className="border-b border-emerald-400/20 bg-emerald-400/5">
              <tr className="text-left text-[11px] uppercase tracking-[0.28em] text-emerald-200/70">
                <th className="px-4 py-3">u_identifier</th>
                <th className="px-4 py-3">username</th>
                <th className="px-4 py-3">email</th>
                <th className="px-4 py-3">workspace</th>
                <th className="px-4 py-3">role</th>
                <th className="px-4 py-3">created_at</th>
                <th className="px-4 py-3 text-right">actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-400/10">
              {users.map(user => {
                const isCurrentUser = currentUser?.id === user.id;

                return (
                  <tr key={user.id} className="transition-colors hover:bg-emerald-400/5">
                    <td className="px-4 py-3 text-xs text-emerald-300/60">{formatId(user.id)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10 font-bold text-emerald-200">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-emerald-100">{user.username}</p>
                          {isCurrentUser && <p className="mt-0.5 text-[10px] text-emerald-300">CURRENT ROOT SESSION</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-emerald-100/60">{user.email || '—'}</td>
                    <td className="px-4 py-3 text-emerald-100/60">{teamLabel(user)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-bold shadow-sm ${roleClass(user.role)}`}>
                        {roleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-emerald-100/50">{formatTimestamp(user.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void handleDeleteUser(user.id)}
                        disabled={isCurrentUser}
                        className="btn btn-sm border border-red-400/20 bg-red-500/10 font-mono text-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        TERMINATE
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {users.length === 0 && (
          <div className="border-t border-emerald-400/10 p-8 text-center">
            <p className="font-mono text-emerald-100">matrix empty</p>
            <p className="mt-1 text-sm text-emerald-100/50">Create a workspace first or wait for team sync.</p>
          </div>
        )}
      </section>
    </div>
  );
}
