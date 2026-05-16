import { useState, useEffect, useCallback } from 'react'
import type { Task } from '@/types'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'
import { useAuth } from '@/store/AuthContext'
import TaskCard from './TaskCard'
import TaskForm from './TaskForm'
import TaskDetail from './TaskDetail'

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const { addToast } = useToast();
  const { user } = useAuth();

  const fetchTasks = useCallback(async () => {
    try {
      const res = await api.tasks.getAll();
      setTasks(res.tasks);
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd ładowania zadań', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      fetchTasks();
      return;
    }
    try {
      const res = await api.tasks.search(searchQuery);
      setTasks(res.tasks);
    } catch {
      addToast('Błąd wyszukiwania', 'error');
    }
  };

  const filteredTasks = tasks.filter(t => {
    if (filterPriority && t.priority !== filterPriority) return false;
    if (filterProject && t.project !== filterProject) return false;
    if (filterStatus === 'completed' && !t.completed) return false;
    if (filterStatus === 'pending' && t.completed) return false;
    return true;
  });

  const projects = [...new Set(tasks.map(t => t.project))];

  const handleTaskUpdate = () => {
    fetchTasks();
    setSelectedTask(null);
  };

  const handleDelete = async (id: number) => {
    try {
      await api.tasks.delete(id);
      addToast('Zadanie usunięte', 'success');
      fetchTasks();
    } catch {
      addToast('Błąd usuwania', 'error');
    }
  };

  const handleComplete = async (id: number) => {
    try {
      await api.tasks.complete(id);
      fetchTasks();
    } catch {
      addToast('Błąd zmiany stanu', 'error');
    }
  };

  const handleCreate = async (data: Record<string, string>) => {
    try {
      await api.tasks.create(data);
      addToast('Zadanie utworzone', 'success');
      setShowCreate(false);
      fetchTasks();
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd tworzenia', 'error');
    }
  };

  const priorityLabel = (p: string) => {
    const map: Record<string, string> = { high: 'Wysoki', medium: 'Średni', low: 'Niski' };
    return map[p] || p;
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Zadania</h2>
        {user?.role === 'admin' && (
          <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm">
            <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nowe zadanie
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Szukaj zadań..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="input pl-10"
          />
        </div>
        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
          className="input sm:w-40"
        >
          <option value="">Priorytet</option>
          <option value="high">Wysoki</option>
          <option value="medium">Średni</option>
          <option value="low">Niski</option>
        </select>
        <select
          value={filterProject}
          onChange={e => setFilterProject(e.target.value)}
          className="input sm:w-40"
        >
          <option value="">Projekt</option>
          {projects.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="input sm:w-40"
        >
          <option value="">Status</option>
          <option value="pending">Oczekujące</option>
          <option value="completed">Zakończone</option>
        </select>
      </div>

      {/* Task list */}
      {filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <svg className="mb-4 h-12 w-12 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-lg font-medium text-gray-500 dark:text-gray-400">Brak zadań</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {user?.role === 'admin' ? 'Kliknij "Nowe zadanie" aby utworzyć' : 'Nie masz przypisanych zadań'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => setSelectedTask(task)}
              onComplete={() => handleComplete(task.id)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)}>
          <TaskForm
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {selectedTask && (
        <Modal onClose={() => setSelectedTask(null)}>
          <TaskDetail
            task={selectedTask}
            onUpdate={handleTaskUpdate}
            onDelete={handleDelete}
            onComplete={handleComplete}
          />
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-gray-900"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
