import type { Project, Task, User } from "@/types"
import { isAdminRole } from "@/types"
import { api } from "@/api/client"
import { useAuth } from "@/store/AuthContext"
import { useToast } from "@/store/ToastContext"
import ProjectTaskRow from "./ProjectTaskRow"
import { useState, useEffect } from "react"

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
  project: ProjectSummary
  allUsers: User[]
  allTasks: Task[]
  assignableTasks: Task[]
  onAddTask: () => void
  onCompleteProject: () => void
  onTaskOpen: (task: Task) => void
  onTaskComplete: (taskId: number) => void
  onTaskAssign: (taskId: number, projectId: number) => void
  onProjectUpdated: () => void
}

export default function ProjectDetail({
  project,
  allUsers,
  assignableTasks,
  onAddTask,
  onCompleteProject,
  onTaskOpen,
  onTaskComplete,
  onTaskAssign,
  onProjectUpdated,
}: Props) {
  const { user } = useAuth()
  const { addToast } = useToast()
  const isAdmin = isAdminRole(user?.role)
  const [selectedProjectMemberIds, setSelectedProjectMemberIds] = useState<string[]>(
    () => project.members.map(m => String(m.id)),
  )
  const [taskToAssignId, setTaskToAssignId] = useState("")
  const [targetProjectId, setTargetProjectId] = useState(String(project.id))

  useEffect(() => {
    setSelectedProjectMemberIds(project.members.map(m => String(m.id)))
    setTargetProjectId(String(project.id))
  }, [project.id, project.members])

  useEffect(() => {
    if (assignableTasks.length === 0) {
      setTaskToAssignId("")
      return
    }
    if (!assignableTasks.some(t => String(t.id) === taskToAssignId)) {
      setTaskToAssignId(String(assignableTasks[0].id))
    }
  }, [assignableTasks, taskToAssignId])

  const completionChecks = [
    {
      label: "Wszystkie zadania zakończone",
      done: project.open === 0,
      detail: project.open === 0 ? "Gotowe" : `${project.open} otwarte`,
    },
    {
      label: "Brak zablokowanych zadań",
      done: project.blocked === 0,
      detail: project.blocked === 0 ? "Gotowe" : `${project.blocked} zablokowane`,
    },
    {
      label: "Brak zadań po terminie",
      done: project.overdue === 0,
      detail: project.overdue === 0 ? "Gotowe" : `${project.overdue} po terminie`,
    },
  ]

  const updateProjectMembers = async () => {
    try {
      await api.projects.update(project.id, {
        member_ids: selectedProjectMemberIds.map(Number),
      })
      onProjectUpdated()
      addToast("Członkowie projektu zaktualizowani", "success")
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd aktualizacji członków projektu",
        "error",
      )
    }
  }

  const handleAssignTask = () => {
    const taskId = Number(taskToAssignId)
    const projId = Number(targetProjectId)
    if (!taskId || !projId) return
    onTaskAssign(taskId, projId)
  }

  const compareTasks = (a: Task, b: Task) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    const rank = { high: 0, medium: 1, low: 2 }
    if (rank[a.priority] !== rank[b.priority])
      return rank[a.priority] - rank[b.priority]
    return (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31")
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {project.name}
          </h3>
          <p className="text-sm text-muted-foreground">
            {project.archived
              ? "Projekt zakończony"
              : `Zadania w projekcie: ${project.total}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Postęp:{" "}
            {project.total > 0
              ? Math.round((project.completed / project.total) * 100)
              : 0}
            %
          </span>
          {isAdmin && !project.archived && (
            <>
              <button onClick={onAddTask} className="btn btn-secondary btn-sm">
                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Dodaj zadanie
              </button>
              <button
                onClick={onCompleteProject}
                disabled={!project.readyToComplete}
                title={!project.readyToComplete ? "Najpierw spełnij checklistę gotowości" : undefined}
                className="btn btn-primary btn-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                Zakończ projekt
              </button>
            </>
          )}
        </div>
      </div>

      {/* Completion Checklist */}
      {!project.archived && (
        <div className="mb-4 rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
              Checklist zakończenia
            </h4>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                project.readyToComplete
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
              }`}
            >
              {project.readyToComplete ? "Gotowy" : "W toku"}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {completionChecks.map(check => (
              <div key={check.label} className="rounded-md border border-border px-2 py-2">
                <div className="mb-1 flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${check.done ? "bg-green-500" : "bg-amber-500"}`} />
                  <p className="truncate text-xs font-medium text-gray-900 dark:text-white">{check.label}</p>
                </div>
                <p className="text-xs text-muted-foreground">{check.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Task List */}
      {project.tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          <p>Ten projekt nie ma jeszcze zadań.</p>
          {isAdmin && !project.archived && (
            <button onClick={onAddTask} className="btn btn-primary btn-sm mt-3">
              Dodaj pierwsze zadanie
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {project.tasks
            .slice()
            .sort(compareTasks)
            .map(task => (
              <ProjectTaskRow
                key={task.id}
                task={task}
                onOpen={() => onTaskOpen(task)}
                onComplete={() => onTaskComplete(task.id)}
              />
            ))}
        </div>
      )}

      {/* Project Members (admin only) */}
      {isAdmin && (
        <div className="mt-4 rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
              Członkowie projektu
            </h4>
            <span className="text-xs text-muted-foreground">{project.members.length}</span>
          </div>
          {allUsers.length === 0 ? (
            <p className="text-xs text-muted-foreground">Brak użytkowników do przypisania.</p>
          ) : (
            <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
              {allUsers.map(member => (
                <label
                  key={member.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-gray-700 hover:bg-muted dark:text-gray-200"
                >
                  <input
                    type="checkbox"
                    checked={selectedProjectMemberIds.includes(String(member.id))}
                    onChange={() =>
                      setSelectedProjectMemberIds(ids =>
                        ids.includes(String(member.id))
                          ? ids.filter(i => i !== String(member.id))
                          : [...ids, String(member.id)],
                      )
                    }
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="truncate">{member.username}</span>
                </label>
              ))}
            </div>
          )}
          <button
            onClick={updateProjectMembers}
            disabled={project.archived}
            className="btn btn-secondary btn-sm mt-3 w-full disabled:cursor-not-allowed disabled:opacity-60"
          >
            Zapisz członków
          </button>
        </div>
      )}

      {/* Assign Task from other project (admin only) */}
      {isAdmin && (
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Projekt docelowy
            </label>
            <select
              value={targetProjectId}
              onChange={event => setTargetProjectId(event.target.value)}
              className="input"
            >
              <option value={project.id}>{project.name}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
              Zadanie z innego projektu
            </label>
            <select
              value={taskToAssignId}
              onChange={event => setTaskToAssignId(event.target.value)}
              disabled={assignableTasks.length === 0}
              className="input"
            >
              {assignableTasks.length === 0 ? (
                <option value="">Brak zadań do przeniesienia</option>
              ) : (
                assignableTasks.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.project})
                  </option>
                ))
              )}
            </select>
          </div>
          <button
            onClick={handleAssignTask}
            disabled={assignableTasks.length === 0 || !taskToAssignId}
            className="btn btn-primary btn-sm w-full"
          >
            Przypisz do projektu
          </button>
        </div>
      )}
    </section>
  )
}
