import type { Project, Task } from "@/types"
import { formatShortDate } from "@/utils/helpers"

type ProjectSummary = Project & {
  tasks: Task[]
  total: number
  completed: number
  open: number
  blocked: number
  overdue: number
  highPriority: number
  nextDueDate: string | null
  readyToComplete: boolean
}

interface Props {
  summaries: ProjectSummary[]
  selectedProjectId: number | null
  onSelect: (id: number) => void
}

export default function ProjectList({ summaries, selectedProjectId, onSelect }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
      {summaries.map(project => (
        <button
          key={project.id}
          type="button"
          onClick={() => onSelect(project.id)}
          className={`card border-t-4 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
            selectedProjectId === project.id
              ? "ring-2 ring-primary/30"
              : ""
          } ${project.archived ? "opacity-65" : ""}`}
          style={{ borderTopColor: project.color }}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-gray-900 dark:text-white">
                {project.name}
              </h3>
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {project.description ||
                  `${project.completed}/${project.total} zakończone`}
              </p>
            </div>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {project.total}
            </span>
          </div>

          <div className="mb-3 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${project.total > 0 ? (project.completed / project.total) * 100 : 0}%`,
                backgroundColor: project.color,
              }}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <ProjectStat
              label="Po terminie"
              value={project.overdue}
              tone={project.overdue > 0 ? "danger" : "default"}
            />
            <ProjectStat
              label="Wysoki"
              value={project.highPriority}
              tone={project.highPriority > 0 ? "warning" : "default"}
            />
            <ProjectStat
              label="Najbliżej"
              value={
                project.nextDueDate
                  ? formatShortDate(project.nextDueDate)
                  : "-"
              }
            />
          </div>
        </button>
      ))}
    </div>
  )
}

function ProjectStat({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: number | string
  tone?: "default" | "danger" | "warning"
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-700 dark:text-red-300"
      : tone === "warning"
        ? "text-amber-700 dark:text-amber-300"
        : "text-gray-900 dark:text-white"

  return (
    <div className="rounded-md border border-border px-2 py-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`truncate text-xs font-semibold ${toneClass}`}>{value}</p>
    </div>
  )
}
