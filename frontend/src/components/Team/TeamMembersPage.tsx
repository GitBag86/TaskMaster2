import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { InviteToken, User } from '@/types'
import { useAuth } from '@/store/AuthContext'
import { useToast } from '@/store/ToastContext'
import { AdminSkeleton } from '@/components/common/Skeletons'
import InviteForm from './InviteForm'

type Tab = 'members' | 'invites';
type ManageableRole = 'manager' | 'user';

export default function TeamMembersPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialTab: Tab = location.pathname.endsWith('/invites') ? 'invites' : 'members';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<InviteToken[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [busyInviteId, setBusyInviteId] = useState<number | null>(null);
  const { user: currentUser, currentTeam } = useAuth();
  const { addToast } = useToast();

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.username.localeCompare(b.username, 'pl')),
    [users],
  );

  const loadUsers = useCallback(async () => {
    try {
      const response = await api.users.getAll();
      setUsers(response.users);
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd ładowania członków', 'error');
    } finally {
      setLoadingUsers(false);
    }
  }, [addToast]);

  const loadInvites = useCallback(async () => {
    try {
      const response = await api.invites.list();
      setInvites(response.invites);
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd ładowania zaproszeń', 'error');
    } finally {
      setLoadingInvites(false);
    }
  }, [addToast]);

  useEffect(() => {
    void loadUsers();
    void loadInvites();
  }, [loadInvites, loadUsers]);

  useEffect(() => {
    const nextTab: Tab = location.pathname.endsWith('/invites') ? 'invites' : 'members';
    setActiveTab(nextTab);
  }, [location.pathname]);

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    navigate(tab === 'invites' ? '/team/invites' : '/team/members');
  };

  const handleRoleChange = async (targetUser: User, role: ManageableRole) => {
    setBusyUserId(targetUser.id);
    try {
      await api.users.updateRole(targetUser.id, role);
      await loadUsers();
      addToast('Rola zaktualizowana', 'success');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd zmiany roli', 'error');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDeleteUser = async (targetUser: User) => {
    const confirmed = window.confirm(`Usunąć użytkownika ${targetUser.username}?`);
    if (!confirmed) return;

    setBusyUserId(targetUser.id);
    try {
      await api.users.delete(targetUser.id);
      await loadUsers();
      addToast('Użytkownik usunięty', 'success');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd usuwania użytkownika', 'error');
    } finally {
      setBusyUserId(null);
    }
  };

  const revokeInvite = async (invite: InviteToken) => {
    setBusyInviteId(invite.id);
    try {
      await api.invites.revoke(invite.id);
      await loadInvites();
      addToast('Zaproszenie cofnięte', 'success');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd cofania zaproszenia', 'error');
    } finally {
      setBusyInviteId(null);
    }
  };

  const handleInviteCreated = (invite: InviteToken) => {
    setInvites(prev => [invite, ...prev.filter(item => item.id !== invite.id)]);
  };

  const loading = activeTab === 'members' ? loadingUsers : loadingInvites;
  if (loading) return <AdminSkeleton />;

  return (
    <div className="space-y-4 page-enter">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Zespół</h2>
        <p className="mt-1 text-sm text-muted-foreground">{currentTeam?.name ?? 'Członkowie i zaproszenia'}</p>
      </div>

      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => switchTab('members')}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${
            activeTab === 'members'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Członkowie
        </button>
        <button
          type="button"
          onClick={() => switchTab('invites')}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${
            activeTab === 'invites'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Zaproszenia
        </button>
      </div>

      {activeTab === 'members' ? (
        <MembersTable
          users={sortedUsers}
          currentUserId={currentUser?.id ?? null}
          busyUserId={busyUserId}
          onRoleChange={handleRoleChange}
          onDelete={handleDeleteUser}
        />
      ) : (
        <div className="space-y-4">
          <InviteForm onCreated={handleInviteCreated} />
          <InvitesList
            invites={invites}
            busyInviteId={busyInviteId}
            onRevoke={revokeInvite}
          />
        </div>
      )}
    </div>
  );
}

function MembersTable({
  users,
  currentUserId,
  busyUserId,
  onRoleChange,
  onDelete,
}: {
  users: User[];
  currentUserId: number | null;
  busyUserId: number | null;
  onRoleChange: (user: User, role: ManageableRole) => void;
  onDelete: (user: User) => void;
}) {
  return (
    <div className="card overflow-hidden">
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-border bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Użytkownik</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">E-mail</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Rola</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Akcje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map(user => {
              const busy = busyUserId === user.id;
              const protectedSelf = user.id === currentUserId;

              return (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900 dark:text-white">{user.username}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{user.email || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${
                      user.role === 'manager'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}>
                      {user.role === 'manager' ? 'Manager' : 'User'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <select
                        value={user.role}
                        onChange={event => onRoleChange(user, event.target.value as ManageableRole)}
                        disabled={busy || protectedSelf}
                        className="input h-9 w-40 text-xs"
                      >
                        <option value="user">User</option>
                        <option value="manager">Manager</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => onDelete(user)}
                        disabled={busy || protectedSelf}
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

      {/* Mobile cards */}
      <div className="divide-y divide-border sm:hidden">
        {users.map(user => {
          const busy = busyUserId === user.id;
          const protectedSelf = user.id === currentUserId;

          return (
            <div key={user.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900 dark:text-white">{user.username}</p>
                    <p className="truncate text-sm text-muted-foreground">{user.email || '—'}</p>
                  </div>
                </div>
                <span className={`badge shrink-0 ${
                  user.role === 'manager'
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                }`}>
                  {user.role === 'manager' ? 'Manager' : 'User'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={user.role}
                  onChange={event => onRoleChange(user, event.target.value as ManageableRole)}
                  disabled={busy || protectedSelf}
                  className="input h-9 flex-1 min-w-[120px] text-xs"
                >
                  <option value="user">User</option>
                  <option value="manager">Manager</option>
                </select>
                <button
                  type="button"
                  onClick={() => onDelete(user)}
                  disabled={busy || protectedSelf}
                  className="btn btn-destructive btn-sm"
                >
                  Usuń
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {users.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground">Brak członków.</div>
      )}
    </div>
  );
}

function InvitesList({
  invites,
  busyInviteId,
  onRevoke,
}: {
  invites: InviteToken[];
  busyInviteId: number | null;
  onRevoke: (invite: InviteToken) => void;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="divide-y divide-border">
        {invites.map(invite => (
          <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Zaproszenie #{invite.id}</p>
              <p className="text-sm text-muted-foreground">
                Wygasa: {new Date(invite.expires_at).toLocaleString('pl-PL')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRevoke(invite)}
              disabled={busyInviteId === invite.id}
              className="btn btn-destructive btn-sm"
            >
              Cofnij
            </button>
          </div>
        ))}
        {invites.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">Brak aktywnych zaproszeń.</div>
        )}
      </div>
    </div>
  );
}
