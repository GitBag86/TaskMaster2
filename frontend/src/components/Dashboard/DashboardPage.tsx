import { useState, useEffect, useCallback } from "react";
import type {
  DashboardStats,
  DependencyBoardResponse,
  Task,
  WeeklyReport,
} from "@/types";
import { api } from "@/api/client";
import { useToast } from "@/store/ToastContext";
import { useSocket } from "@/store/SocketContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { DashboardSkeleton } from "@/components/common/Skeletons";

const COLORS = ["#ef4444", "#f59e0b", "#22c55e"];
const dependencyRefreshActions = new Set([
  "created",
  "updated",
  "completed",
  "reopened",
  "deleted",
  "bulk_completed",
  "bulk_deleted",
  "bulk_updated",
  "dependency_added",
  "dependency_removed",
  "mentioned",
]);

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [dependencyBoard, setDependencyBoard] =
    useState<DependencyBoardResponse | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
  const { lastTaskEvent } = useSocket();

  const fetchDashboard = useCallback(async () => {
    try {
      const [statsData, boardData, reportData] = await Promise.all([
        api.stats.dashboard(),
        api.tasks.dependencyBoard(),
        api.stats.weekly(),
      ]);
      setStats(statsData);
      setDependencyBoard(boardData);
      setWeeklyReport(reportData);
    } catch {
      addToast("Błąd ładowania dashboardu", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    if (!lastTaskEvent || !dependencyRefreshActions.has(lastTaskEvent.action))
      return;
    void fetchDashboard();
  }, [fetchDashboard, lastTaskEvent]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!stats || !dependencyBoard || !weeklyReport) return null;

  const priorityData = [
    { name: "Wysoki", value: stats.by_priority.high },
    { name: "Średni", value: stats.by_priority.medium },
    { name: "Niski", value: stats.by_priority.low },
  ];

  const projectData = Object.entries(stats.by_project).map(([name, data]) => ({
    name,
    Zakończone: data.completed,
    Suma: data.total,
  }));

  return (
    <div className="space-y-6 page-enter">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
        Statystyki
      </h2>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Wszystkie" value={stats.total} />
        <StatCard
          label="Zakończone"
          value={stats.completed}
          color="text-green-500"
        />
        <StatCard label="W toku" value={stats.pending} color="text-blue-500" />
        <StatCard label="Zaległe" value={stats.overdue} color="text-red-500" />
        <StatCard label="Ukończenie" value={`${stats.completion_rate}%`} />
      </div>

      <DependencyBoard board={dependencyBoard} />

      <WeeklyReportPanel report={weeklyReport} />

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="mb-4 text-sm font-medium text-gray-900 dark:text-white">
            Priorytety
          </h3>
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
          <h3 className="mb-4 text-sm font-medium text-gray-900 dark:text-white">
            Projekty
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={projectData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Suma" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar
                  dataKey="Zakończone"
                  fill="#22c55e"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function WeeklyReportPanel({ report }: { report: WeeklyReport }) {
  const topProjects = Object.entries(report.by_project)
    .sort(([, a], [, b]) => b.open - a.open || b.total - a.total)
    .slice(0, 4);

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Raport tygodniowy
          </h3>
          <p className="text-xs text-muted-foreground">
            {report.range.from} - {report.range.to}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Otwarte teraz: {report.summary.open}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        <MiniMetric
          label="Utworzone"
          value={report.summary.created}
          tone="warning"
        />
        <MiniMetric
          label="Zakończone"
          value={report.summary.completed}
          tone="success"
        />
        <MiniMetric
          label="Po terminie"
          value={report.summary.overdue}
          tone="danger"
        />
        <MiniMetric
          label="Zablokowane"
          value={report.summary.blocked}
          tone="warning"
        />
        <MiniMetric label="Otwarte" value={report.summary.open} tone="danger" />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Najbardziej aktywne projekty
          </h4>
          {topProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Brak danych projektowych.
            </p>
          ) : (
            <div className="space-y-2">
              {topProjects.map(([name, data]) => (
                <div
                  key={name}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="truncate text-gray-900 dark:text-white">
                    {name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {data.completed}/{data.total} zakończone, {data.open}{" "}
                    otwarte
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Zakończenia wg osób
          </h4>
          {Object.keys(report.completed_by_user).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Brak zakończonych zadań w tym tygodniu.
            </p>
          ) : (
            <div className="space-y-2">
              {Object.entries(report.completed_by_user).map(
                ([username, count]) => (
                  <div
                    key={username}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="truncate text-gray-900 dark:text-white">
                      {username}
                    </span>
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      {count}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function DependencyBoard({ board }: { board: DependencyBoardResponse }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Blokady
          </h3>
          <p className="text-xs text-muted-foreground">
            Zależności, blokery i zadania gotowe do podjęcia.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right">
          <MiniMetric
            label="Zablokowane"
            value={board.counts.blocked}
            tone="warning"
          />
          <MiniMetric
            label="Blokery"
            value={board.counts.blockers}
            tone="danger"
          />
          <MiniMetric
            label="Gotowe"
            value={board.counts.ready}
            tone="success"
          />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <DependencyColumn
          title="Zablokowane"
          emptyText="Nic nie czeka na zależności."
          items={board.blocked}
          renderItem={(task) => (
            <TaskBoardItem
              key={task.id}
              task={task}
              meta={
                task.blocked_by.length > 0
                  ? `Czeka na: ${task.blocked_by.map((blocker) => blocker.title).join(", ")}`
                  : "Czeka na zależność"
              }
              tone="warning"
            />
          )}
        />

        <DependencyColumn
          title="Największe blokery"
          emptyText="Żadne zadanie nie blokuje innych."
          items={board.blockers}
          renderItem={(task) => (
            <div key={task.id} className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                    {task.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {task.project}
                  </p>
                </div>
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  {task.blocking_count}
                </span>
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">
                Blokuje:{" "}
                {task.blocking_tasks
                  .map((blockedTask) => blockedTask.title)
                  .join(", ")}
              </p>
            </div>
          )}
        />

        <DependencyColumn
          title="Gotowe do pracy"
          emptyText="Brak otwartych zadań bez blokad."
          items={board.ready}
          renderItem={(task) => (
            <TaskBoardItem
              key={task.id}
              task={task}
              meta={
                task.due_date
                  ? `Termin: ${formatShortDate(task.due_date)}`
                  : "Bez terminu"
              }
              tone="success"
            />
          )}
        />
      </div>
    </section>
  );
}

function DependencyColumn<T>({
  title,
  emptyText,
  items,
  renderItem,
}: {
  title: string;
  emptyText: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h4>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          items.map(renderItem)
        )}
      </div>
    </div>
  );
}

function TaskBoardItem({
  task,
  meta,
  tone,
}: {
  task: Task;
  meta: string;
  tone: "success" | "warning";
}) {
  const toneClass =
    tone === "success" ? "border-l-green-500" : "border-l-amber-500";

  return (
    <div
      className={`rounded-md border border-l-4 border-border p-3 ${toneClass}`}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white">
          {task.title}
        </p>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${priorityClass(task.priority)}`}
        >
          {priorityLabel(task.priority)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{task.project}</p>
      <p className="mt-1 line-clamp-2 text-xs text-gray-600 dark:text-gray-300">
        {meta}
      </p>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "danger";
}) {
  const color = {
    success: "text-green-600 dark:text-green-300",
    warning: "text-amber-600 dark:text-amber-300",
    danger: "text-red-600 dark:text-red-300",
  }[tone];

  return (
    <div className="rounded-md border border-border px-2 py-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  color = "text-primary",
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function priorityLabel(priority: Task["priority"]) {
  return priority === "high"
    ? "Wysoki"
    : priority === "medium"
      ? "Średni"
      : "Niski";
}

function priorityClass(priority: Task["priority"]) {
  if (priority === "high")
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  if (priority === "medium")
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
}

function formatShortDate(date: string) {
  return new Date(date).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "short",
  });
}
