import type { DependencyBoardResponse, Task } from "@/types"
import { priorityLabel, priorityClass, formatShortDate } from "@/utils/helpers"

interface Props {
  board: DependencyBoardResponse
}

export default function DependencyBoard({ board }: Props) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Blokady</h3>
          <p className="text-xs text-muted-foreground">Zależności, blokery i zadania gotowe do podjęcia.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right">
          <MiniMetric label="Zablokowane" value={board.counts.blocked} tone="warning" />
          <MiniMetric label="Blokery" value={board.counts.blockers} tone="danger" />
          <MiniMetric label="Gotowe" value={board.counts.ready} tone="success" />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <DependencyColumn
          title="Zablokowane"
          emptyText="Nic nie czeka na zależności."
          items={board.blocked}
          renderItem={task => (
            <TaskBoardItem
              key={task.id}
              task={task}
              meta={
                task.blocked_by.length > 0
                  ? `Czeka na: ${task.blocked_by.map(b => b.title).join(", ")}`
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
          renderItem={task => (
            <div key={task.id} className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                    {task.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{task.project}</p>
                </div>
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  {task.blocking_count}
                </span>
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">
                Blokuje: {task.blocking_tasks.map(t => t.title).join(", ")}
              </p>
            </div>
          )}
        />

        <DependencyColumn
          title="Gotowe do pracy"
          emptyText="Brak otwartych zadań bez blokad."
          items={board.ready}
          renderItem={task => (
            <TaskBoardItem
              key={task.id}
              task={task}
              meta={task.due_date ? `Termin: ${formatShortDate(task.due_date)}` : "Bez terminu"}
              tone="success"
            />
          )}
        />
      </div>
    </section>
  )
}

function DependencyColumn<T>({
  title,
  emptyText,
  items,
  renderItem,
}: {
  title: string
  emptyText: string
  items: T[]
  renderItem: (item: T) => React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
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
  )
}

function TaskBoardItem({
  task,
  meta,
  tone,
}: {
  task: Task
  meta: string
  tone: "success" | "warning"
}) {
  const toneClass = tone === "success" ? "border-l-green-500" : "border-l-amber-500"

  return (
    <div className={`rounded-md border border-l-4 border-border p-3 ${toneClass}`}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white">
          {task.title}
        </p>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${priorityClass(task.priority)}`}>
          {priorityLabel(task.priority)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{task.project}</p>
      <p className="mt-1 line-clamp-2 text-xs text-gray-600 dark:text-gray-300">{meta}</p>
    </div>
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
