import { useState, useEffect, useCallback } from 'react'
import type { DashboardStats } from '@/types'
import { api } from '@/api/client'
import { useToast } from '@/store/ToastContext'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const COLORS = ['#ef4444', '#f59e0b', '#22c55e'];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.stats.dashboard();
      setStats(data);
    } catch {
      addToast('Błąd ładowania statystyk', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!stats) return null;

  const priorityData = [
    { name: 'Wysoki', value: stats.by_priority.high },
    { name: 'Średni', value: stats.by_priority.medium },
    { name: 'Niski', value: stats.by_priority.low },
  ];

  const projectData = Object.entries(stats.by_project).map(([name, data]) => ({
    name,
    Zakończone: data.completed,
    Suma: data.total,
  }));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Statystyki</h2>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Wszystkie" value={stats.total} />
        <StatCard label="Zakończone" value={stats.completed} color="text-green-500" />
        <StatCard label="W toku" value={stats.pending} color="text-blue-500" />
        <StatCard label="Zaległe" value={stats.overdue} color="text-red-500" />
        <StatCard label="Ukończenie" value={`${stats.completion_rate}%`} />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="mb-4 text-sm font-medium text-gray-900 dark:text-white">Priorytety</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={priorityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {priorityData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="mb-4 text-sm font-medium text-gray-900 dark:text-white">Projekty</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={projectData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Suma" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Zakończone" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color = 'text-primary' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
