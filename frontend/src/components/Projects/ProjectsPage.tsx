import { useCallback, useEffect, useMemo, useState } from "react"
import type { Project, Task, User } from "@/types"
import { isAdminRole } from "@/types"
import { api } from "@/api/client"
import { useAuth } from "@/store/AuthContext"
import { useSocket } from "@/store/SocketContext"
import { useToast } from "@/store/ToastContext"
import { TasksPageSkeleton } from "@/components/common/Skeletons"
import Modal from "@/components/common/Modal"
import TaskDetail from "@/components/Tasks/TaskDetail"
import TaskForm from "@/components/Tasks/TaskForm"
import { updateTaskInProjects } from "@/utils/taskEventHelpers"
import { EmptyState } from "@/components/common/EmptyState"
import { useProjectsQuery } from "@/hooks/useProjectsQuery"
import ProjectList from "./ProjectList"
import ProjectDetail from "./ProjectDetail"
import ProjectForm from "./ProjectForm"

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

type ProjectTaskFormData = {
  title: string
  assignee_ids?: number[]
  priority?: Task["priority"]
  project?: string
  project_id?: number | null
  due_date?: string
  notes?: string
}

const FULL_RELOAD_ACTIONS = new Set([
  "bulk_completed",
  "bulk_deleted",
  "bulk_updated",
  "project_created",
  "project_updated",
  "project_archived",
  "project_completed",
])

function buildProjectSummary(project: Project): ProjectSummary {
  const tasks = project.tasks ?? []
  const today = new Date(new Date().toDateString())
  const openTasks = tasks.filter(task => !task.completed)
  const nextDueDate =
    openTasks
      .map(task => task.due_date)
      .filter((date): date is string => Boolean(date))
      .sort()[0] ?? null

  return {
    ...project,
    tasks,
    total: tasks.length,
    completed: tasks.filter(task => task.completed).length,
    open: openTasks.length,
    blocked: openTasks.filter(task => task.is_blocked).length,
    overdue: tasks.filter(
      task => task.due_date && !task.completed && new Date(task.due_date) < today,
    ).length,
    highPriority: openTasks.filter(task => task.priority === "high").length,
    nextDueDate,
    readyToComplete: openTasks.length === 0,
  }
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showNewProject, setShowNewProject] = useState(false)
  const [showNewProjectTask, setShowNewProjectTask] = useState(false)
  const [allUsers, setAllUsers] = useState<User[]>([])

  const { user } = useAuth()
  const { lastTaskEvent } = useSocket()
  const { addToast } = useToast()

  // Use React Query for projects caching; local state for socket-driven partial updates
  const query = useProjectsQuery()

  const loadProjects = useCallback(async () => {
    try {
      const response = await api.projects.getAll()
      setProjects(response.projects)
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd ładowania projektów",
        "error",
      )
    } finally {
      setLoading(false)
    }
  }, [addToast])

  const loadUsers = useCallback(async () => {
    if (!isAdminRole(user?.role)) {
      setAllUsers([])
      return
    }

    try {
      const response = await api.users.getAll()
      setAllUsers(response.users)
    } catch {
      setAllUsers([])
    }
  }, [user?.role])

  // Seed local state from query cache, then do manual fetch as fallback
  useEffect(() => {
    if (query.data) {
      setProjects(query.data.projects)
      setLoading(false)
    } else if (!query.isLoading) {
      void loadProjects()
    }
  }, [query.data, query.isLoading, loadProjects])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  useEffect(() => {
    if (!lastTaskEvent) return

    if (FULL_RELOAD_ACTIONS.has(lastTaskEvent.action)) {
      void loadProjects()
      return
    }

    if (lastTaskEvent.task || lastTaskEvent.action === "deleted") {
      setProjects(prev => updateTaskInProjects(prev, lastTaskEvent))
      return
    }

    void loadProjects()
  }, [lastTaskEvent, loadProjects])

  const summaries = useMemo(
    () =>
      projects
        .map(buildProjectSummary)
        .sort(
          (a, b) =>
            Number(a.archived) - Number(b.archived) ||
            a.name.localeCompare(b.name, "pl"),
        ),
    [projects],
  )

  useEffect(() => {
    const activeProjects = summaries.filter(project => !project.archived)
    const candidates = activeProjects.length > 0 ? activeProjects : summaries
    if (candidates.length === 0) {
      setSelectedProjectId(null)
      return
    }
    if (
      !selectedProjectId ||
      !summaries.some(project => project.id === selectedProjectId)
    ) {
      setSelectedProjectId(candidates[0].id)
    }
  }, [selectedProjectId, summaries])

  const selectedProject =
    summaries.find(project => project.id === selectedProjectId) ?? null
  const activeProjects = summaries.filter(project => !project.archived)
  const allTasks = useMemo(
    () => summaries.flatMap(project => project.tasks),
    [summaries],
  )
  const assignableTasks = useMemo(
    () =>
      allTasks
        .filter(
          task =>
            String(task.project_id ?? "") !== String(selectedProjectId ?? ""),
        )
        .sort((a, b) => a.title.localeCompare(b.title, "pl")),
    [allTasks, selectedProjectId],
  )

  useEffect(() => {
    if (!selectedTask) return
    const syncedTask = allTasks.find(task => task.id === selectedTask.id)
    if (!syncedTask) {
      setSelectedTask(null)
      return
    }
    if (syncedTask !== selectedTask) {
      setSelectedTask(syncedTask)
    }
  }, [allTasks, selectedTask])

  const handleProjectCreated = async (projectId: number) => {
    await loadProjects()
    setSelectedProjectId(projectId)
    setShowNewProject(false)
  }

  const createTaskInSelectedProject = async (data: ProjectTaskFormData) => {
    if (!selectedProject || selectedProject.archived) return

    try {
      const createdTask = await api.tasks.create({
        ...data,
        project: selectedProject.name,
        project_id: selectedProject.id,
      })
      await loadProjects()
      setSelectedProjectId(selectedProject.id)
      setSelectedTask(createdTask)
      setShowNewProjectTask(false)
      addToast(`Dodano zadanie do projektu: ${selectedProject.name}`, "success")
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd tworzenia zadania",
        "error",
      )
      throw err
    }
  }

  const handleAssignTask = async (taskId: number, projectId: number) => {
    try {
      await api.tasks.update(taskId, { project_id: projectId })
      await loadProjects()
      setSelectedProjectId(projectId)
      addToast("Zadanie przypisane do projektu", "success")
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd przypisywania zadania",
        "error",
      )
    }
  }

  const handleCompleteProject = async (projectId: number) => {
    try {
      const completed = await api.projects.complete(projectId)
      await loadProjects()
      setSelectedProjectId(completed.id)
      addToast("Projekt zakończony", "success")
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd kończenia projektu",
        "error",
      )
    }
  }

  const handleTaskComplete = async (taskId: number) => {
    try {
      const updatedTask = await api.tasks.complete(taskId)
      await loadProjects()
      setSelectedTask(prev =>
        prev?.id === updatedTask.id ? updatedTask : prev,
      )
      addToast(
        updatedTask.completed ? "Zadanie zakończone" : "Zadanie przywrócone",
        "success",
      )
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd zmiany stanu",
        "error",
      )
    }
  }

  const handleDeleteTask = async (taskId: number) => {
    try {
      await api.tasks.delete(taskId)
      await loadProjects()
      setSelectedTask(null)
      addToast("Zadanie usunięte", "success")
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd usuwania zadania",
        "error",
      )
    }
  }

  const handleUpdateTask = async (task: Task) => {
    await loadProjects()
    setSelectedTask(task)
  }

  if (loading) {
    return <TasksPageSkeleton />
  }

  return (
    <div className="space-y-6 page-enter">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Projekty</h2>
          <p className="text-sm text-muted-foreground">
            Prawdziwe projekty z opisem, kolorem, archiwum i przypisanymi zadaniami.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdminRole(user?.role) && (
            <button
              onClick={() => setShowNewProject(true)}
              className="btn btn-primary btn-sm"
            >
              <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Nowy projekt
            </button>
          )}
          <Metric label="Aktywne" value={activeProjects.length} />
          <Metric label="Zadania" value={allTasks.length} />
        </div>
      </div>

      {summaries.length === 0 ? (
        <EmptyState
          type="projects"
          title="Brak projektów"
          description="Utwórz pusty projekt i przypisz do niego zadania, kiedy będą gotowe."
          action={
            isAdminRole(user?.role) ? (
              <button onClick={() => setShowNewProject(true)} className="btn btn-primary btn-sm">
                Nowy projekt
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <ProjectList
              summaries={summaries}
              selectedProjectId={selectedProjectId}
              onSelect={setSelectedProjectId}
            />

            {selectedProject && (
              <ProjectDetail
                project={selectedProject}
                allUsers={allUsers}
                allTasks={allTasks}
                assignableTasks={assignableTasks}
                onAddTask={() => setShowNewProjectTask(true)}
                onCompleteProject={() => void handleCompleteProject(selectedProject.id)}
                onTaskOpen={setSelectedTask}
                onTaskComplete={taskId => void handleTaskComplete(taskId)}
                onTaskAssign={(taskId, projectId) => void handleAssignTask(taskId, projectId)}
                onProjectUpdated={() => void loadProjects()}
              />
            )}
          </div>

          <aside className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
              Przypisywanie
            </h3>
            <p className="mb-4 text-xs text-muted-foreground">
              {isAdminRole(user?.role)
                ? "Przenieś istniejące zadanie do aktywnego projektu."
                : "Możesz przeglądać projekty, w których masz przypisane zadania."}
            </p>

            {isAdminRole(user?.role) ? (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Projekt docelowy
                  </label>
                  <select
                    value={selectedProjectId ?? ""}
                    onChange={event => setSelectedProjectId(Number(event.target.value))}
                    disabled={activeProjects.length === 0}
                    className="input"
                  >
                    {activeProjects.length === 0 ? (
                      <option value="">Brak aktywnych projektów</option>
                    ) : (
                      activeProjects.map(project => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Zadanie z innego projektu
                  </label>
                  <select
                    className="input"
                    disabled={assignableTasks.length === 0}
                    onChange={event => {
                      const taskId = Number(event.target.value)
                      if (taskId && selectedProjectId) {
                        void handleAssignTask(taskId, selectedProjectId)
                      }
                    }}
                  >
                    <option value="">Wybierz zadanie</option>
                    {assignableTasks.map(task => (
                      <option key={task.id} value={task.id}>
                        {task.title} ({task.project})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                Tylko administrator może przenosić zadania między projektami.
              </div>
            )}
          </aside>
        </div>
      )}

      {selectedTask && (
        <Modal onClose={() => setSelectedTask(null)}>
          <TaskDetail
            task={selectedTask}
            onDelete={id => void handleDeleteTask(id)}
            onComplete={id => void handleTaskComplete(id)}
            onUpdate={task => void handleUpdateTask(task)}
            onClose={() => setSelectedTask(null)}
          />
        </Modal>
      )}

      {showNewProjectTask && selectedProject && (
        <Modal onClose={() => setShowNewProjectTask(false)}>
          <TaskForm
            initialData={{
              title: "",
              priority: "medium",
              project: selectedProject.name,
              project_id: selectedProject.id,
              due_date: "",
              notes: "",
              assignee_ids: [],
            }}
            heading={`Nowe zadanie w projekcie: ${selectedProject.name}`}
            submitLabel="Dodaj zadanie"
            lockedProjectName={selectedProject.name}
            availableAssignees={selectedProject.members}
            onSubmit={data => createTaskInSelectedProject(data)}
            onCancel={() => setShowNewProjectTask(false)}
          />
        </Modal>
      )}

      {showNewProject && (
        <Modal onClose={() => setShowNewProject(false)}>
          <ProjectForm
            allUsers={allUsers}
            onProjectCreated={handleProjectCreated}
            onCancel={() => setShowNewProject(false)}
          />
        </Modal>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-right">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-white">
        {value}
      </p>
    </div>
  )
}
