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
    setLoading(true);
    try {
      const response = await api.users.getAll();
      setUsers(response.users);
    } catch (error: unknown) {
      addToast(error instanceof Error ? error.message : 'Błąd ładowania użytkowników', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.users.create({
        username: newUsername.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      });
      addToast('User created successfully', 'success');
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      fetchUsers();
    } catch (error: unknown) {
      addToast(error instanceof Error ? error.message : 'Error creating user', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await api.users.delete(userId);
      addToast('User deleted successfully', 'success');
      fetchUsers();
    } catch (error: unknown) {
      addToast(error instanceof Error ? error.message : 'Error deleting user', 'error');
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
          <p className="mt-1 text-sm text-green-200/70 font-mono">zarądzańąśe urethninkowych // root access</p>
        </div>
      </div>

      <form onSubmit={handleCreateUser} className="card border border-green-500/20 bg-gray-950/90 p-4 shadow-lg shadow-green-950/10">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-mono text-lg text-green-300">&gt; create_user()</h3>
            <p className="text-sm text-muted-foreground">Utwórz konto i wybierz poczatkową rolę.</p>
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
            required
          />
          <select
            value={newRole}
            onChange={e => setNewRole(e.target.value as ManageableRole)}
            className="input bg-gray-900/50 font-mono text-green-100"
          >
            <option value="user">user</option>
            <option value="manager">manager</option>
          </select>
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary whitespace-nowrap font-mono text-green-400 bg-green-900/20 hover:bg-green-900/40 border border-green-500/30"
          >
            {saving ? '...' : 'EXECUTE'}
          </button>
        </div>
      </form>

      <div className="card overflow-hidden border border-green-500/20 bg-gray-950/90">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] font-mono text-sm">
            <thead className="border-b border-green-500/20 bg-green-900/10">
              <tr className="text-green-400">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">u_identifier</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">u_email</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">u_role</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">u_actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-green-500/10">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-green-500/5 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10 text-green-400 font-bold border border-green-500/20">
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-green-100 font-medium">{u.username}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-green-200/70">{u.email || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`badge font-mono ${u.role === 'super_admin' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : u.role === 'manager' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDeleteUser(u.id)}
                        disabled={u.id === currentUser?.id}
                        className="btn btn-sm bg-red-600/10 font-mono text-red-400 hover:bg-red-600/20 border border-red-600/20 disabled:opacity-30"
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
