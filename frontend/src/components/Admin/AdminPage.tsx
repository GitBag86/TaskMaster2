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
    <div className="space-y-4 page-enter">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Zarządzanie użytkownikami</h2>
      <form onSubmit={handleCreateUser} className="card p-4">
        <div className="mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">Dodaj użytkownika</h3>
          <p className="text-sm text-muted-foreground">Utwórz konto i wybierz początkową rolę.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_180px_auto]">
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
          <select value={newRole} onChange={e => setNewRole(e.target.value as ManageableRole)} className="input">
            <option value="user">Użytkownik</option>
            <option value="manager">Administrator</option>
          </select>
          <button type="submit" disabled={saving} className="btn btn-primary whitespace-nowrap">
            {saving ? 'Dodawanie...' : 'Dodaj'}
          </button>
        </div>
      </form>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-border bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Użytkownik</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Rola</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900 dark:text-white">{u.username}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{u.email || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${
                      u.role === 'super_admin' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : u.role === 'manager' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}>
                      {u.role === 'super_admin' ? 'Super Admin'
                        : u.role === 'manager' ? 'Administrator'
                        : 'Użytkownik'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={u.role}
                        onChange={e => handleRoleChange(u.id, e.target.value as ManageableRole)}
                        disabled={u.id === currentUser?.id}
                        className="input h-8 w-40 text-xs"
                      >
                        <option value="user">Użytkownik</option>
                        <option value="manager">Administrator</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleDeleteUser(u)}
                        disabled={u.id === currentUser?.id}
                        className="btn btn-destructive btn-sm"
                      >
                        Usuń
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
