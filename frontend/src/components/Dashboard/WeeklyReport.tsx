import type { WeeklyReport as WeeklyReportType } from "@/types"

interface Props {
  report: WeeklyReportType
}

export default function WeeklyReport({ report }: Props) {
  const topProjects = Object.entries(report.by_project)
    .sort(([, a], [, b]) => b.open - a.open || b.total - a.total)
    .slice(0, 4)

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Raport tygodniowy</h3>
          <p className="text-xs text-muted-foreground">
            {report.range.from} - {report.range.to}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">Otwarte teraz: {report.summary.open}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        <MiniMetric label="Utworzone" value={report.summary.created} tone="warning" />
        <MiniMetric label="Zakończone" value={report.summary.completed} tone="success" />
        <MiniMetric label="Po terminie" value={report.summary.overdue} tone="danger" />
        <MiniMetric label="Zablokowane" value={report.summary.blocked} tone="warning" />
        <MiniMetric label="Otwarte" value={report.summary.open} tone="danger" />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Najbardziej aktywne projekty
          </h4>
          {topProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak danych projektowych.</p>
          ) : (
            <div className="space-y-2">
              {topProjects.map(([name, data]) => (
                <div key={name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-gray-900 dark:text-white">{name}</span>
                  <span className="text-xs text-muted-foreground">
                    {data.completed}/{data.total} zakończone, {data.open} otwarte
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
            <p className="text-sm text-muted-foreground">Brak zakończonych zadań w tym tygodniu.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(report.completed_by_user).map(([username, count]) => (
                <div key={username} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-gray-900 dark:text-white">{username}</span>
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "success" | "warning" | "danger"
}) {
  const color = {
    success: "text-green-600 dark:text-green-300",
    warning: "text-amber-600 dark:text-amber-300",
    danger: "text-red-600 dark:text-red-300",
  }[tone]

  return (
    <div className="rounded-md border border-border px-2 py-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${color}`}>{value}</p>
    </div>
  )
}
