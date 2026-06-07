import { useState, useEffect } from "react"
import type { DependencyBoardResponse, Task, DashboardStats, WeeklyReport } from "@/types"
import { useSocket } from "@/store/SocketContext"
import { useAuth } from "@/store/AuthContext"
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
} from "recharts"
import { DashboardSkeleton } from "@/components/common/Skeletons"
import { canPartiallyUpdate, replaceTaskInList } from "@/utils/taskEventHelpers"
import { useDashboardDataQuery } from "@/hooks/useDashboardQuery"
import StatCards from "./StatCards"
import DependencyBoard from "./DependencyBoard"
import WeeklyReportPanel from "./WeeklyReport"

const COLORS = ["#ef4444", "#f59e0b", "#22c55e"]

export default function DashboardPage() {
  const { data, isLoading, isError } = useDashboardDataQuery()
  const { lastTaskEvent } = useSocket()
  const { user } = useAuth()

  // Local board state to accumulate socket-driven partial updates between refreshes
  const [board, setBoard] = useState<DependencyBoardResponse | null>(null)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [report, setReport] = useState<WeeklyReport | null>(null)

  // Sync from query cache on load or refresh
  useEffect(() => {
    if (data) {
      setStats(data.stats)
      setBoard(data.board)
      setReport(data.report)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.stats, data?.board, data?.report])

  // Accumulate socket partial updates onto the local board state
  useEffect(() => {
    if (!lastTaskEvent || lastTaskEvent.user === user?.username) return

    if (lastTaskEvent.task && canPartiallyUpdate(lastTaskEvent)) {
      const task = lastTaskEvent.task!
      setBoard(prev => {
        if (!prev) return prev
        const applyUpdate = (tasks: Task[]) => replaceTaskInList(tasks, task)
        return {
          ...prev,
          blocked: applyUpdate(prev.blocked),
          ready: applyUpdate(prev.ready),
          blockers: prev.blockers.map(b =>
            b.id === task.id
              ? { ...b, ...task, blocking_count: b.blocking_count, blocking_tasks: b.blocking_tasks }
              : b,
          ),
        }
      })
    }
  }, [lastTaskEvent, user?.username])

  if (isLoading || !stats || !board || !report) return <DashboardSkeleton />
  if (isError) return null

  const priorityData = [
    { name: "Wysoki", value: stats.by_priority.high },
    { name: "Średni", value: stats.by_priority.medium },
    { name: "Niski", value: stats.by_priority.low },
  ]

  const projectData = Object.entries(stats.by_project).map(([name, data]) => ({
    name,
    Zakończone: data.completed,
    Suma: data.total,
  }))

  return (
    <div className="space-y-6 page-enter">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Statystyki</h2>

      <StatCards
        total={stats.total}
        completed={stats.completed}
        pending={stats.pending}
        overdue={stats.overdue}
        completionRate={stats.completion_rate}
      />

      {board && <DependencyBoard board={board} />}
      <WeeklyReportPanel report={report} />

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
  )
}


