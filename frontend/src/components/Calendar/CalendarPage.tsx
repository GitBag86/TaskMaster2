import { useState, useEffect, useCallback } from 'react'
import type { Task } from '@/types'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'
import { useSocket } from '@/store/SocketContext'

const days = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
const months = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

export default function CalendarPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
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

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDay = (firstDay.getDay() + 6) % 7;

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const getDayTasks = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return tasks.filter(t => t.due_date === dateStr);
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
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Kalendarz</h2>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="btn btn-secondary btn-sm">←</button>
          <span className="min-w-[140px] text-center font-medium text-gray-900 dark:text-white">
            {months[month]} {year}
          </span>
          <button onClick={nextMonth} className="btn btn-secondary btn-sm">→</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {days.map(d => (
            <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: startDay }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-border bg-gray-50/50 dark:bg-gray-900/30" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayTasks = getDayTasks(day);
            const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();

            return (
              <div key={day} className={`min-h-[80px] border-b border-r border-border p-1 ${isToday ? 'bg-primary/5' : ''}`}>
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${isToday ? 'bg-primary text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                  {day}
                </span>
                <div className="mt-1 space-y-0.5">
                  {dayTasks.slice(0, 2).map(t => (
                    <div
                      key={t.id}
                      className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${
                        t.completed ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        t.priority === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        t.priority === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {t.title}
                    </div>
                  ))}
                  {dayTasks.length > 2 && (
                    <div className="text-[10px] text-muted-foreground">+{dayTasks.length - 2} więcej</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
