import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import type { Team } from '@/types'
import { useToast } from '@/store/ToastContext'
import { AdminSkeleton } from '@/components/common/Skeletons'

type EditingTeam = {
  id: number;
  name: string;
  description: string;
};

export default function TeamsAdminPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionTeamId, setActionTeamId] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editingTeam, setEditingTeam] = useState<EditingTeam | null>(null);
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

  const createTeam = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return;

    setSaving(true);
    try {
      await api.teams.create({
        name: newName.trim(),
        description: newDescription.trim(),
      });
      setNewName('');
      setNewDescription('');
      await loadTeams();
      addToast('Zespół utworzony', 'success');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd tworzenia zespołu', 'error');
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (team: Team) => {
    setEditingTeam({
      id: team.id,
      name: team.name,
      description: team.description ?? '',
    });
  };

  const saveTeam = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingTeam?.name.trim()) return;

    setActionTeamId(editingTeam.id);
    try {
      await api.teams.update(editingTeam.id, {
        name: editingTeam.name.trim(),
        description: editingTeam.description.trim(),
      });
      setEditingTeam(null);
      await loadTeams();
      addToast('Zespół zaktualizowany', 'success');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd aktualizacji zespołu', 'error');
    } finally {
      setActionTeamId(null);
    }
  };

  const toggleArchive = async (team: Team) => {
    setActionTeamId(team.id);
    try {
      await api.teams.archive(team.id, !team.archived);
      await loadTeams();
      addToast(team.archived ? 'Zespół przywrócony' : 'Zespół zarchiwizowany', 'success');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd zmiany statusu zespołu', 'error');
    } finally {
      setActionTeamId(null);
    }
  };

  const deleteTeam = async (team: Team) => {
    const confirmed = window.confirm(`Usunąć zespół ${team.name}? Ta operacja jest trwała.`);
    if (!confirmed) return;

    setActionTeamId(team.id);
    try {
      await api.teams.delete(team.id);
      await loadTeams();
      addToast('Zespół usunięty', 'success');
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'team_not_empty') {
        const cascadeConfirmed = window.confirm(
          `Zespół ${team.name} zawiera członków lub zasoby. Usunąć zespół wraz ze wszystkimi danymi (użytkownicy, zadania, projekty, komentarze, audyt)? Tej operacji NIE można cofnąć.`,
        );
        if (!cascadeConfirmed) {
          setActionTeamId(null);
          return;
        }
        try {
          await api.teams.delete(team.id, true);
          await loadTeams();
          addToast('Zespół usunięty wraz z zawartością', 'success');
        } catch (cascadeErr: unknown) {
          addToast(
            cascadeErr instanceof Error ? cascadeErr.message : 'Nie udało się usunąć zespołu z zawartością',
            'error',
          );
        }
      } else {
        addToast(err instanceof Error ? err.message : 'Nie można usunąć zespołu', 'error');
      }
    } finally {
      setActionTeamId(null);
    }
  };

  if (loading) return <AdminSkeleton />;

  return (
    <div className="space-y-4 page-enter">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Zespoły</h2>
        <p className="mt-1 text-sm text-muted-foreground">Twórz workspace'y i zarządzaj ich statusem.</p>
      </div>

      <form onSubmit={createTeam} className="card p-4">
        <div className="mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">Nowy zespół</h3>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_2fr_auto]">
          <input
            value={newName}
            onChange={event => setNewName(event.target.value)}
            className="input"
            placeholder="Nazwa zespołu"
            maxLength={80}
            required
          />
          <input
            value={newDescription}
            onChange={event => setNewDescription(event.target.value)}
            className="input"
            placeholder="Opis"
            maxLength={500}
          />
          <button type="submit" disabled={saving} className="btn btn-primary whitespace-nowrap">
            {saving ? 'Tworzenie...' : 'Utwórz'}
          </button>
        </div>
      </form>

      <div className="card overflow-hidden">
        {/* Mobile card view */}
        <div className="divide-y divide-border sm:hidden">
          {teams.map(team => {
            const isEditing = editingTeam?.id === team.id;
            const busy = actionTeamId === team.id;

            return (
              <div key={team.id} className="p-3">
                {isEditing ? (
                  <form id={`team-edit-${team.id}`} onSubmit={saveTeam} className="space-y-2">
                    <input value={editingTeam.name} onChange={event => setEditingTeam({ ...editingTeam, name: event.target.value })} className="input h-9" maxLength={80} required />
                    <input value={editingTeam.description} onChange={event => setEditingTeam({ ...editingTeam, description: event.target.value })} className="input h-9" maxLength={500} placeholder="Opis" />
                    <div className="flex gap-2">
                      <button type="submit" disabled={busy} className="btn btn-primary btn-sm flex-1">Zapisz</button>
                      <button type="button" onClick={() => setEditingTeam(null)} className="btn btn-secondary btn-sm">Anuluj</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <Link to={`/admin/teams/${team.id}`} className="font-medium text-primary hover:underline">{team.name}</Link>
                        {team.description && <p className="text-xs text-muted-foreground truncate">{team.description}</p>}
                      </div>
                      <StatusBadge archived={team.archived} />
                    </div>
                    <div className="mb-2 flex gap-3 text-xs text-muted-foreground">
                      <span>Slug: {team.slug}</span>
                      <span>Członkowie: {team.stats?.members ?? 0}</span>
                      <span>{team.created_at ? new Date(team.created_at).toLocaleDateString('pl-PL') : '—'}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => startEditing(team)} className="btn btn-secondary btn-sm">Zmień nazwę</button>
                      <button type="button" onClick={() => void toggleArchive(team)} disabled={busy} className="btn btn-secondary btn-sm">{team.archived ? 'Przywróć' : 'Archiwizuj'}</button>
                      <button type="button" onClick={() => void deleteTeam(team)} disabled={busy} className="btn btn-destructive btn-sm">Usuń</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full min-w-[940px]">
            <thead className="border-b border-border bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Nazwa</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Slug</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Członkowie</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Utworzono</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {teams.map(team => {
                const isEditing = editingTeam?.id === team.id;
                const busy = actionTeamId === team.id;

                return (
                  <tr key={team.id} className="align-top hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <form id={`team-edit-${team.id}`} onSubmit={saveTeam} className="space-y-2">
                          <input
                            value={editingTeam.name}
                            onChange={event => setEditingTeam({ ...editingTeam, name: event.target.value })}
                            className="input h-9"
                            maxLength={80}
                            required
                          />
                          <input
                            value={editingTeam.description}
                            onChange={event => setEditingTeam({ ...editingTeam, description: event.target.value })}
                            className="input h-9"
                            maxLength={500}
                            placeholder="Opis"
                          />
                        </form>
                      ) : (
                        <>
                          <Link to={`/admin/teams/${team.id}`} className="font-medium text-primary hover:underline">
                            {team.name}
                          </Link>
                          {team.description && (
                            <p className="mt-0.5 max-w-md truncate text-xs text-muted-foreground">{team.description}</p>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{team.slug}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{team.stats?.members ?? 0}</td>
                    <td className="px-4 py-3">
                      <StatusBadge archived={team.archived} />
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {team.created_at ? new Date(team.created_at).toLocaleDateString('pl-PL') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        {isEditing ? (
                          <>
                            <button type="submit" form={`team-edit-${team.id}`} disabled={busy} className="btn btn-primary btn-sm">
                              Zapisz
                            </button>
                            <button type="button" onClick={() => setEditingTeam(null)} className="btn btn-secondary btn-sm">
                              Anuluj
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => startEditing(team)} className="btn btn-secondary btn-sm">
                              Zmień nazwę
                            </button>
                            <button type="button" onClick={() => void toggleArchive(team)} disabled={busy} className="btn btn-secondary btn-sm">
                              {team.archived ? 'Przywróć' : 'Archiwizuj'}
                            </button>
                            <button type="button" onClick={() => void deleteTeam(team)} disabled={busy} className="btn btn-destructive btn-sm">
                              Usuń
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
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
