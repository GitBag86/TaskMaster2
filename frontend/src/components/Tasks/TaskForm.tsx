import { useState } from 'react'

interface Props {
  onSubmit: (data: Record<string, string>) => void;
  onCancel: () => void;
  initialData?: Record<string, string>;
  submitLabel?: string;
}

export default function TaskForm({ onSubmit, onCancel, initialData, submitLabel = 'Utwórz zadanie' }: Props) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [assignedTo, setAssignedTo] = useState(initialData?.assigned_to || '');
  const [priority, setPriority] = useState(initialData?.priority || 'medium');
  const [project, setProject] = useState(initialData?.project || '');
  const [dueDate, setDueDate] = useState(initialData?.due_date || '');
  const [notes, setNotes] = useState(initialData?.notes || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ title, assigned_to: assignedTo, priority, project, due_date: dueDate, notes });
  };

  return (
    <form onSubmit={handleSubmit} className="p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
        {initialData ? 'Edytuj zadanie' : 'Nowe zadanie'}
      </h3>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Tytuł *</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="input" required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Priorytet</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} className="input">
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
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Przypisane do</label>
          <input type="text" value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className="input" placeholder="Nieprzypisane" />
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
