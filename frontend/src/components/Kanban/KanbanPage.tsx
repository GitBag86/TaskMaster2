import { useState, useEffect, useCallback } from 'react'
import type { Task } from '@/types'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'
import { useSocket } from '@/store/SocketContext'

const columns = [
  { key: 'todo' as const, label: 'Do zrobienia', color: 'border-gray-300 dark:border-gray-600' },
  { key: 'in_progress' as const, label: 'W toku', color: 'border-blue-400 dark:border-blue-500' },
  { key: 'done' as const, label: 'Zakończone', color: 'border-green-400 dark:border-green-500' },
] as const;

export default function KanbanPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
  const { lastTaskEvent } = useSocket();

  const fetchTasks = useCallback(async () => {
    try {
      const res = await api.tasks.getAll();
      setTasks(res.tasks);
    } catch {
      addToast('Błąd ładowania zadań', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    if (!lastTaskEvent) return;
    if (lastTaskEvent.task && ['created', 'updated', 'completed', 'reopened'].includes(lastTaskEvent.action)) {
      setTasks(prev => {
        const index = prev.findIndex(task => task.id === lastTaskEvent.task_id);
        if (index === -1) return [lastTaskEvent.task!, ...prev];
        const next = [...prev];
        next[index] = lastTaskEvent.task!;
        return next;
      });
      return;
    }

    if (lastTaskEvent.action === 'deleted' && lastTaskEvent.task_id) {
      setTasks(prev => prev.filter(task => task.id !== lastTaskEvent.task_id));
      return;
    }

    if (lastTaskEvent.task_ids && ['bulk_deleted', 'bulk_completed', 'bulk_updated'].includes(lastTaskEvent.action)) {
      fetchTasks();
    }
  }, [fetchTasks, lastTaskEvent]);

  const handleDrop = async (e: React.DragEvent, status: Task['status']) => {
    e.preventDefault();
    const taskId = Number(e.dataTransfer.getData('taskId'));
    try {
      await api.tasks.update(taskId, { status, completed: status === 'done' });
      addToast('Status zaktualizowany', 'success');
      fetchTasks();
    } catch {
      addToast('Błąd aktualizacji', 'error');
    }
  };

  const handleDragStart = (e: React.DragEvent, taskId: number) => {
    e.dataTransfer.setData('taskId', String(taskId));
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Kanban</h2>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map(col => {
          const colTasks = tasks.filter(t => t.status === col.key);
          return (
            <div
              key={col.key}
              className={`min-w-[280px] flex-1 rounded-xl border-t-4 ${col.color} bg-gray-50 p-4 dark:bg-gray-900/50`}
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDrop(e, col.key)}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 dark:text-white">{col.label}</h3>
                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  {colTasks.length}
                </span>
              </div>
              <div className="space-y-3">
                {colTasks.map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={e => handleDragStart(e, task.id)}
                    className="cursor-grab rounded-lg border border-border bg-white p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing dark:bg-gray-800"
                  >
                    <p className={`text-sm font-medium ${task.completed ? 'line-through text-muted-foreground' : 'text-gray-900 dark:text-white'}`}>
                      {task.title}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{task.project}</span>
                      <span className={`rounded px-1.5 py-0.5 ${
                        task.priority === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        task.priority === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      }`}>
                        {task.priority === 'high' ? 'Wysoki' : task.priority === 'medium' ? 'Średni' : 'Niski'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
