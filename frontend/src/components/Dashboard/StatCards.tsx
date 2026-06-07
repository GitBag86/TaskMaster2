interface Props {
  total: number
  completed: number
  pending: number
  overdue: number
  completionRate: number
}

export default function StatCards({
  total,
  completed,
  pending,
  overdue,
  completionRate,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard label="Wszystkie" value={total} />
      <StatCard label="Zakończone" value={completed} color="text-green-500" />
      <StatCard label="W toku" value={pending} color="text-blue-500" />
      <StatCard label="Zaległe" value={overdue} color="text-red-500" />
      <StatCard label="Ukończenie" value={`${completionRate}%`} />
    </div>
  )
}

function StatCard({
  label,
  value,
  color = "text-primary",
}: {
  label: string
  value: string | number
  color?: string
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
