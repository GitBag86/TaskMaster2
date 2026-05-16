import { useState, useEffect, useCallback } from 'react'
import type { ActivityLog } from '@/types'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'

export default function ActivityPage() {
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const fetchActivity = useCallback(async () => {
    try {
      const res = await api.activity.getAll(100);
      setActivity(res.activity);
    } catch {
      addToast('Błąd ładowania aktywności', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Historia aktywności</h2>
      <div className="space-y-2">
        {activity.map(a => (
          <div key={a.id} className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-gray-900 dark:text-white">{a.action}</span>
                <span className="mx-1 text-muted-foreground">w zadaniu</span>
                <span className="font-medium text-primary">#{a.task_id}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(a.created_at).toLocaleString('pl-PL')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
