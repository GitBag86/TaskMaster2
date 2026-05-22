import { useEffect, useRef, useState } from 'react'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'
import type { User } from '@/types'

interface TaskFormData {
  title: string;
  assignee_ids?: number[]; // Changed to array of numbers
  priority?: 'low' | 'medium' | 'high';
  project?: string;
  project_id?: number | null;
  due_date?: string;
  notes?: string;
}

interface Props {
  onSubmit: (data: TaskFormData) => void;
  onCancel: () => void;
  initialData?: TaskFormData;
  submitLabel?: string;
  heading?: string;
  lockedProjectName?: string;
  availableAssignees?: User[];
}

export default function TaskForm({ onSubmit, onCancel, initialData, submitLabel = 'Utwórz zadanie', heading, lockedProjectName, availableAssignees }: Props) {
  const dueDateInputRef = useRef<HTMLInputElement | null>(null)
  const [title, setTitle] = useState(initialData?.title || '');
  const [assignedUserId, setAssignedUserId] = useState(initialData?.assignee_ids?.[0] ? String(initialData.assignee_ids[0]) : '');
  const [priority, setPriority] = useState(initialData?.priority || 'medium');
  const [project, setProject] = useState(initialData?.project || '');
  const [projectId] = useState<number | null | undefined>(initialData?.project_id);
  const [dueDate, setDueDate] = useState(initialData?.due_date || '');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [users, setUsers] = useState<User[]>(availableAssignees ?? []); // State to store fetched users
  const { addToast } = useToast();

  useEffect(() => {
    if (availableAssignees) {
      setUsers(availableAssignees);
      if (assignedUserId && !availableAssignees.some(user => String(user.id) === assignedUserId)) {
        setAssignedUserId('');
      }
      return;
    }

    const fetchUsers = async () => {
      try {
        const response = await api.users.getAll();
        setUsers(response.users);
      } catch (error) {
        addToast('Błąd ładowania użytkowników', 'error');
      }
    };
    fetchUsers();
  }, [addToast, availableAssignees, assignedUserId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      title,
      assignee_ids: assignedUserId ? [Number(assignedUserId)] : [],
      priority,
      project: lockedProjectName ?? project,
      project_id: lockedProjectName ? projectId : undefined,
      due_date: dueDate,
      notes,
    });
  };

  const openDueDatePicker = () => {
    const input = dueDateInputRef.current
    if (!input) return

    input.focus()
    if (typeof input.showPicker === 'function') {
      input.showPicker()
    }
  }

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
            {lockedProjectName ? (
              <div className="flex h-10 items-center rounded-md border border-border bg-muted/40 px-3 text-sm font-medium text-gray-700 dark:text-gray-200">
                {lockedProjectName}
              </div>
            ) : (
              <input type="text" value={project} onChange={e => setProject(e.target.value)} className="input" placeholder="Ogólny" />
            )}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="assigned-to-select">Przypisane do</label>
          <select
            id="assigned-to-select"
            value={assignedUserId}
            onChange={e => setAssignedUserId(e.target.value)}
            className="input"
          >
            <option value="">Nieprzypisane</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.username}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Zadanie może mieć tylko jednego wykonawcę.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Termin</label>
          <div className="relative">
            <input ref={dueDateInputRef} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="date-input input pr-10" />
            <button
              type="button"
              onClick={openDueDatePicker}
              className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-muted dark:text-cyan-100 dark:hover:bg-white/10"
              aria-label="Wybierz termin"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
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
