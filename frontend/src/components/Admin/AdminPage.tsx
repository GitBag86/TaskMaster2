import { useState, useEffect, useCallback } from 'react'
import type { User } from '@/types'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'
import { useAuth } from '@/store/AuthContext'
import { AdminSkeleton } from '@/components/common/Skeletons'

type ManageableRole = 'manager' | 'user';

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<ManageableRole>('user');
  const { addToast } = useToast();
  const { user: currentUser } = useAuth();

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.users.getAll();
      setUsers(res.users);
    } catch {
      addToast('Błąd ładowania użytkowników', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.users.create({
        username: newUsername.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      });
      addToast('Użytkownik dodany', 'success');
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('user');
      await fetchUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd dodawania użytkownika';
      addToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (userId: number, role: ManageableRole) => {
    try {
      await api.users.updateRole(userId, role);
      addToast('Rola zaktualizowana', 'success');
      await fetchUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd zmiany roli';
      addToast(message, 'error');
    }
  };

  const handleDeleteUser = async (targetUser: User) => {
    const confirmed = window.confirm(`Usunąć użytkownika ${targetUser.username}? Tej operacji nie można cofnąć.`);
    if (!confirmed) return;

    try {
      await api.users.delete(targetUser.id);
      addToast('Użytkownik usunięty', 'success');
      await fetchUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd usuwania użytkownika';
      addToast(message, 'error');
    }
  };

  if (loading) {
    return <AdminSkeleton />;
  }

  return (
    <div className="space-y-6 page-enter">
      <div className="relative overflow-hidden rounded-2xl border border-green-500/20 bg-gradient-to-r from-gray-950 via-green-950/30 to-gray-950 p-6 shadow-2xl shadow-green-950/20">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.03)_1px,transparent_1px)] bg-[size:20px_20px]"></div>
        <div className="relative">
          <div className="mb-2 flex items-center gap-2 text-green-400">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse"></span>
            <span className="text-xs font-mono uppercase tracking-[0.3em]">system.override</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Super Admin Console</h2>
          <p className="mt-1 text-sm text-green-200/70 font-mono">zarządzanie użytkownikami // root access</p>
        </div>
      </div>

      <form onSubmit={handleCreateUser} className="card border border-green-500/20 bg-gray-950/90 p-4 shadow-lg shadow-green-950/10">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-mono text-lg text-green-300">&gt; create_user()</h3>
            <p className="text-sm text-muted-foreground">Utwórz konto i wybierz początkową rolę.</p>
          </div>
          <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs font-mono text-green-400">WRITE_MODE</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_180px_auto]">
          <input
            type="text"
            value={newUsername}
            onChange={e => setNewUsername(e.target.value)}
            className="input bg-gray-900/50 font-mono text-green-100 placeholder:text-green-800/50"
            placeholder="Nazwa użytkownika"
            minLength={3}
            required
          />
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            className="input bg-gray-900/50 font-mono text-green-100 placeholder:text-green-800/50"
            placeholder="E-mail"
            required
          />
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="input bg-gray-900/50 font-mono text-green-100 placeholder:text-green-800/50"
            placeholder="Hasło"
            minLength={6}
            required
          />
          <select value={newRole} onChange={e => setNewRole(e.target.value as ManageableRole)} className="input bg-gray-900/50 font-mono text-green-100">
            <option value="user">user</option>
            <option value="manager">manager</option>
          </select>
          <button type="submit" disabled={saving} className="btn whitespace-nowrap bg-green-600 font-mono text-green-50 hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? 'EXECUTING...' : 'EXECUTE'}
          </button>
        </div>
      </form>

      <div className="card overflow-hidden border border-green-500/20 bg-gray-950/90 shadow-lg shadow-green-950/10">
        <div className="border-b border-green-500/10 bg-gray-900/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-500"></span>
            <span className="h-3 w-3 rounded-full bg-yellow-500"></span>
            <span className="h-3 w-3 rounded-full bg-green-500"></span>
            <span className="ml-2 font-mono text-sm text-green-400">users.db — read_only</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-green-500/10 bg-gray-900/70">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-wider text-green-400/70">ID</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-wider text-green-400/70">username</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-wider text-green-400/70">email</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-wider text-green-400/70">role</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-wider text-green-400/70">actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-green-500/5">
              {users.map(u => (
                <tr key={u.id} className="font-mono hover:bg-green-500/5 transition-colors">
                  <td className="px-4 py-3 text-green-500/50 text-xs">#{u.id}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md border border-green-500/20 bg-green-500/10 text-sm font-bold text-green-300">
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-green-100">{u.username}</span>
                      {u.id === currentUser?.id && (
                        <span className="rounded bg-green-500/10 px-2 py-0.5 text-[10px] text-green-400">YOU</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-green-200/60">{u.email || 'null'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-mono ${
                      u.role === 'super_admin' ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                      : u.role === 'manager' ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                      : 'bg-gray-800 text-green-300 border border-green-500/10'
                    }`}>
                      {u.role === 'super_admin' ? 'ROOT'
                        : u.role === 'manager' ? 'ADMIN'
                        : 'USER'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={u.role}
                        onChange={e => handleRoleChange(u.id, e.target.value as ManageableRole)}
                        disabled={u.id === currentUser?.id}
                        className="input h-8 w-36 bg-gray-900/50 font-mono text-xs text-green-100 disabled:opacity-50"
                      >
                        <option value="user">user</option>
                        <option value="manager">manager</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleDeleteUser(u)}
                        disabled={u.id === currentUser?.id}
                        className="btn btn-sm bg-red-600/20 font-mono text-red-300 hover:bg-red-600/30 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        DELETE
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
