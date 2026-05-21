import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'

interface User {
  id: number;
  username: string;
}

interface TaskFormData {
  title: string;
  assignee_ids?: number[]; // Changed to array of numbers
  priority?: 'low' | 'medium' | 'high';
  project?: string;
  due_date?: string;
  notes?: string;
}

interface Props {
  onSubmit: (data: TaskFormData) => void;
  onCancel: () => void;
  initialData?: TaskFormData;
  submitLabel?: string;
  heading?: string;
}

export default function TaskForm({ onSubmit, onCancel, initialData, submitLabel = 'Utwórz zadanie', heading }: Props) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [assignedUserIds, setAssignedUserIds] = useState<number[]>(initialData?.assignee_ids || []);
  const [priority, setPriority] = useState(initialData?.priority || 'medium');
  const [project, setProject] = useState(initialData?.project || '');
  const [dueDate, setDueDate] = useState(initialData?.due_date || '');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [users, setUsers] = useState<User[]>([]); // State to store fetched users
  const { addToast } = useToast();

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await api.users.getAll();
        setUsers(response.users);
      } catch (error) {
        addToast('Błąd ładowania użytkowników', 'error');
      }
    };
    fetchUsers();
  }, [addToast]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ title, assignee_ids: assignedUserIds, priority, project, due_date: dueDate, notes });
  };

  return (
    <form onSubmit={handleSubmit} className="p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
        {heading ?? (initialData ? 'Edytuj zadanie' : 'Nowe zadanie')}
      </h3>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Tytuł *</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="input" required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Priorytet</label>
            <select value={priority} onChange={e => setPriority(e.target.value as 'low' | 'medium' | 'high')} className="input">
              <option value="low">Niski</option>
              <option value="medium">Średni</option>
              <option value="high">Wysoki</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Projekt</label>
            <input type="text" value={project} onChange={e => setProject(e.target.value)} className="input" placeholder="Ogólny" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="assigned-to-select">Przypisane do</label>
          <select
            id="assigned-to-select"
            multiple
            value={assignedUserIds.map(String)}
            onChange={e =>
              setAssignedUserIds(
                Array.from(e.target.selectedOptions, option => Number(option.value)).filter(id => Number.isFinite(id) && id > 0)
              )
            }
            className="input h-auto min-h-[40px]"
          >
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.username}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Wybierz jednego lub wielu użytkowników. Aby zostawić bez przypisania, nie zaznaczaj nikogo.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Termin</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Notatki</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input" rows={3} />
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="btn btn-secondary btn-sm">Anuluj</button>
        <button type="submit" className="btn btn-primary btn-sm">{submitLabel}</button>
      </div>
    </form>
  );
}
