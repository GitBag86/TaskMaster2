import { useState } from 'react'
import type { Task, Subtask } from '@/types'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'
import { useAuth } from '@/store/AuthContext'

interface Props {
  task: Task;
  onUpdate: () => void;
  onDelete: (id: number) => void;
  onComplete: (id: number) => void;
}

export default function TaskDetail({ task, onUpdate, onDelete, onComplete }: Props) {
  const [subtasks, setSubtasks] = useState(task.subtasks);
  const [newSubtask, setNewSubtask] = useState('');
  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState(task.comments);
  const { addToast } = useToast();
  const { user } = useAuth();

  const handleAddSubtask = async () => {
    if (!newSubtask.trim()) return;
    try {
      const sub = await api.subtasks.add(task.id, newSubtask);
      setSubtasks(prev => [...prev, sub]);
      setNewSubtask('');
      addToast('Podzadanie dodane', 'success');
    } catch {
      addToast('Błąd dodawania podzadania', 'error');
    }
  };

  const handleToggleSubtask = async (sub: Subtask) => {
    try {
      await api.subtasks.complete(sub.id);
      setSubtasks(prev => prev.map(s => s.id === sub.id ? { ...s, completed: !s.completed } : s));
    } catch {
      addToast('Błąd zmiany stanu', 'error');
    }
  };

  const handleDeleteSubtask = async (id: number) => {
    try {
      await api.subtasks.delete(id);
      setSubtasks(prev => prev.filter(s => s.id !== id));
    } catch {
      addToast('Błąd usuwania', 'error');
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      const comment = await api.comments.add(task.id, newComment);
      setComments(prev => [...prev, comment]);
      setNewComment('');
    } catch {
      addToast('Błąd dodawania komentarza', 'error');
    }
  };

  const priorityLabel = (p: string) => ({ high: 'Wysoki', medium: 'Średni', low: 'Niski' }[p] || p);
  const statusLabel = (s: string) => ({ todo: 'Do zrobienia', in_progress: 'W toku', done: 'Zakończone' }[s] || s);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-start justify-between">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{task.title}</h3>
        <button onClick={onComplete} className={`btn btn-sm ${task.completed ? 'btn-secondary' : 'btn-primary'}`}>
          {task.completed ? 'Przywróć' : 'Zakończ'}
        </button>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <span className="badge bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">{priorityLabel(task.priority)}</span>
        <span className="badge bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">{statusLabel(task.status)}</span>
        <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{task.project}</span>
        {task.due_date && (
          <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{task.due_date}</span>
        )}
      </div>

      {task.notes && (
        <div className="mb-6 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
          <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{task.notes}</p>
        </div>
      )}

      {/* Subtasks */}
      <div className="mb-6">
        <h4 className="mb-2 text-sm font-medium text-gray-900 dark:text-white">Podzadania</h4>
        <div className="space-y-2">
          {subtasks.map(s => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
              <input
                type="checkbox"
                checked={s.completed}
                onChange={() => handleToggleSubtask(s)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className={`flex-1 text-sm ${s.completed ? 'line-through text-muted-foreground' : 'text-gray-900 dark:text-white'}`}>
                {s.title}
              </span>
              <button onClick={() => handleDeleteSubtask(s.id)} className="text-xs text-destructive hover:underline">Usuń</button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={newSubtask}
            onChange={e => setNewSubtask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddSubtask()}
            placeholder="Nowe podzadanie..."
            className="input flex-1"
          />
          <button onClick={handleAddSubtask} className="btn btn-secondary btn-sm">Dodaj</button>
        </div>
      </div>

      {/* Comments */}
      <div className="mb-6">
        <h4 className="mb-2 text-sm font-medium text-gray-900 dark:text-white">Komentarze</h4>
        <div className="space-y-2">
          {comments.map(c => (
            <div key={c.id} className="rounded-lg border border-border p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs font-medium text-gray-900 dark:text-white">{c.author}</span>
                <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString('pl-PL')}</span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300">{c.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddComment()}
            placeholder="Dodaj komentarz..."
            className="input flex-1"
          />
          <button onClick={handleAddComment} className="btn btn-secondary btn-sm">Wyślij</button>
        </div>
      </div>

      {/* Actions */}
      {user?.role === 'admin' && (
        <div className="flex justify-end gap-3 border-t border-border pt-4">
          <button onClick={() => onDelete(task.id)} className="btn btn-destructive btn-sm">Usuń zadanie</button>
        </div>
      )}
    </div>
  );
}
