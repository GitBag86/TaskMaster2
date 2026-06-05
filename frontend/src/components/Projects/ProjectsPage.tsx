import { useCallback, useEffect, useMemo, useState } from "react";
import type { Project, Task, User } from "@/types";
import { isAdminRole } from "@/types";
import { api } from "@/api/client";
import { useAuth } from "@/store/AuthContext";
import { useSocket } from "@/store/SocketContext";
import { useToast } from "@/store/ToastContext";
import { TasksPageSkeleton } from "@/components/common/Skeletons";
import Modal from "@/components/common/Modal";
import TaskDetail from "@/components/Tasks/TaskDetail";
import TaskForm from "@/components/Tasks/TaskForm";
import { priorityLabel, priorityClass, formatShortDate } from "@/utils/helpers";

type ProjectSummary = Project & {
  tasks: Task[];
  total: number;
  completed: number;
  open: number;
  blocked: number;
  overdue: number;
  highPriority: number;
  nextDueDate: string | null;
  readyToComplete: boolean;
};

type ProjectTaskFormData = {
  title: string;
  assignee_ids?: number[];
  priority?: Task["priority"];
  project?: string;
  project_id?: number | null;
  due_date?: string;
  notes?: string;
};

const taskEventActions = new Set([
  "created",
  "updated",
  "completed",
  "reopened",
  "deleted",
  "bulk_completed",
  "bulk_deleted",
  "bulk_updated",
  "project_created",
  "project_updated",
  "project_archived",
  "project_completed",
]);

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    null,
  );
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskToAssignId, setTaskToAssignId] = useState("");
  const [targetProjectId, setTargetProjectId] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewProjectTask, setShowNewProjectTask] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [newProjectColor, setNewProjectColor] = useState("#3b82f6");
  const [newProjectMemberIds, setNewProjectMemberIds] = useState<string[]>([]);
  const [selectedProjectMemberIds, setSelectedProjectMemberIds] = useState<
    string[]
  >([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  const { user } = useAuth();
  const { lastTaskEvent } = useSocket();
  const { addToast } = useToast();

  const loadProjects = useCallback(async () => {
    try {
      const response = await api.projects.getAll();
      setProjects(response.projects);
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd ładowania projektów",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  const loadUsers = useCallback(async () => {
    if (!isAdminRole(user?.role)) {
      setAllUsers([]);
      return;
    }

    try {
      const response = await api.users.getAll();
      setAllUsers(response.users);
    } catch {
      setAllUsers([]);
    }
  }, [user?.role]);

  useEffect(() => {
    void loadProjects();
    void loadUsers();
  }, [loadProjects, loadUsers]);

  useEffect(() => {
    if (!lastTaskEvent || !taskEventActions.has(lastTaskEvent.action)) return;
    void loadProjects();
  }, [lastTaskEvent, loadProjects]);

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
  );

  useEffect(() => {
    const activeProjects = summaries.filter((project) => !project.archived);
    const candidates = activeProjects.length > 0 ? activeProjects : summaries;
    if (candidates.length === 0) {
      setSelectedProjectId(null);
      return;
    }
    if (
      !selectedProjectId ||
      !summaries.some((project) => project.id === selectedProjectId)
    ) {
      setSelectedProjectId(candidates[0].id);
    }
  }, [selectedProjectId, summaries]);

  useEffect(() => {
    if (selectedProjectId) {
      setTargetProjectId(String(selectedProjectId));
    }
  }, [selectedProjectId]);

  const selectedProject =
    summaries.find((project) => project.id === selectedProjectId) ?? null;
  const activeProjects = summaries.filter((project) => !project.archived);
  const allTasks = useMemo(
    () => summaries.flatMap((project) => project.tasks),
    [summaries],
  );
  const assignableTasks = useMemo(
    () =>
      allTasks
        .filter((task) => String(task.project_id ?? "") !== targetProjectId)
        .sort((a, b) => a.title.localeCompare(b.title, "pl")),
    [allTasks, targetProjectId],
  );

  useEffect(() => {
    if (assignableTasks.length === 0) {
      setTaskToAssignId("");
      return;
    }
    if (!assignableTasks.some((task) => String(task.id) === taskToAssignId)) {
      setTaskToAssignId(String(assignableTasks[0].id));
    }
  }, [assignableTasks, taskToAssignId]);

  useEffect(() => {
    setSelectedProjectMemberIds(
      (selectedProject?.members ?? []).map((member) => String(member.id)),
    );
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedTask) return;
    const syncedTask = allTasks.find((task) => task.id === selectedTask.id);
    if (!syncedTask) {
      setSelectedTask(null);
      return;
    }
    if (syncedTask !== selectedTask) {
      setSelectedTask(syncedTask);
    }
  }, [allTasks, selectedTask]);

  const createProject = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;

    try {
      const project = await api.projects.create({
        name,
        description: newProjectDescription.trim(),
        color: newProjectColor,
        member_ids: newProjectMemberIds.map(Number),
      });
      await loadProjects();
      setSelectedProjectId(project.id);
      setTargetProjectId(String(project.id));
      setShowNewProject(false);
      setNewProjectName("");
      setNewProjectDescription("");
      setNewProjectColor("#3b82f6");
      setNewProjectMemberIds([]);
      addToast(`Projekt ${project.name} utworzony`, "success");
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd tworzenia projektu",
        "error",
      );
    }
  };

  const createTaskInSelectedProject = async (data: ProjectTaskFormData) => {
    if (!selectedProject || selectedProject.archived) return;

    try {
      const createdTask = await api.tasks.create({
        ...data,
        project: selectedProject.name,
        project_id: selectedProject.id,
      });
      await loadProjects();
      setSelectedProjectId(selectedProject.id);
      setSelectedTask(createdTask);
      setShowNewProjectTask(false);
      addToast(
        `Dodano zadanie do projektu: ${selectedProject.name}`,
        "success",
      );
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd tworzenia zadania",
        "error",
      );
    }
  };

  const assignTaskToProject = async () => {
    const taskId = Number(taskToAssignId);
    const projectId = Number(targetProjectId);
    if (!taskId || !projectId) return;

    try {
      await api.tasks.update(taskId, { project_id: projectId });
      await loadProjects();
      setSelectedProjectId(projectId);
      addToast("Zadanie przypisane do projektu", "success");
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd przypisywania zadania",
        "error",
      );
    }
  };

  const updateProjectMembers = async () => {
    if (!selectedProject) return;

    try {
      const updatedProject = await api.projects.update(selectedProject.id, {
        member_ids: selectedProjectMemberIds.map(Number),
      });
      await loadProjects();
      setSelectedProjectId(updatedProject.id);
      addToast("Członkowie projektu zaktualizowani", "success");
    } catch (err: unknown) {
      addToast(
        err instanceof Error
          ? err.message
          : "Błąd aktualizacji członków projektu",
        "error",
      );
    }
  };

  const completeProject = async (projectId: number) => {
    try {
      const completed = await api.projects.complete(projectId);
      await loadProjects();
      setSelectedProjectId(completed.id);
      addToast("Projekt zakończony", "success");
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd kończenia projektu",
        "error",
      );
    }
  };

  const toggleTaskComplete = async (taskId: number) => {
    try {
      const updatedTask = await api.tasks.complete(taskId);
      await loadProjects();
      setSelectedTask((prev) =>
        prev?.id === updatedTask.id ? updatedTask : prev,
      );
      addToast(
        updatedTask.completed ? "Zadanie zakończone" : "Zadanie przywrócone",
        "success",
      );
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd zmiany stanu",
        "error",
      );
    }
  };

  const deleteTask = async (taskId: number) => {
    try {
      await api.tasks.delete(taskId);
      await loadProjects();
      setSelectedTask(null);
      addToast("Zadanie usunięte", "success");
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd usuwania zadania",
        "error",
      );
    }
  };

  const updateTask = async (task: Task) => {
    await loadProjects();
    setSelectedTask(task);
  };

  if (loading) {
    return <TasksPageSkeleton />;
  }

  const completionChecks = selectedProject
    ? [
        {
          label: "Wszystkie zadania zakończone",
          done: selectedProject.open === 0,
          detail:
            selectedProject.open === 0
              ? "Gotowe"
              : `${selectedProject.open} otwarte`,
        },
        {
          label: "Brak zablokowanych zadań",
          done: selectedProject.blocked === 0,
          detail:
            selectedProject.blocked === 0
              ? "Gotowe"
              : `${selectedProject.blocked} zablokowane`,
        },
        {
          label: "Brak zadań po terminie",
          done: selectedProject.overdue === 0,
          detail:
            selectedProject.overdue === 0
              ? "Gotowe"
              : `${selectedProject.overdue} po terminie`,
        },
      ]
    : [];

  return (
    <div className="space-y-6 page-enter">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Projekty
          </h2>
          <p className="text-sm text-muted-foreground">
            Prawdziwe projekty z opisem, kolorem, archiwum i przypisanymi
            zadaniami.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdminRole(user?.role) && (
            <button
              onClick={() => setShowNewProject(true)}
              className="btn btn-primary btn-sm"
            >
              <svg
                className="mr-2 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Nowy projekt
            </button>
          )}
          <Metric label="Aktywne" value={activeProjects.length} />
          <Metric label="Zadania" value={allTasks.length} />
        </div>
      </div>

      {summaries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-lg font-medium text-gray-500 dark:text-gray-400">
            Brak projektów
          </p>
          <p className="text-sm text-muted-foreground">
            Utwórz pusty projekt i przypisz do niego zadania, kiedy będą gotowe.
          </p>
          {isAdminRole(user?.role) && (
            <button
              onClick={() => setShowNewProject(true)}
              className="btn btn-primary btn-sm mt-4"
            >
              Nowy projekt
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {summaries.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setSelectedProjectId(project.id)}
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

            {selectedProject && (
              <section className="rounded-lg border border-border bg-card p-4">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {selectedProject.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedProject.archived
                        ? "Projekt zakończony"
                        : `Zadania w projekcie: ${selectedProject.total}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      Postęp:{" "}
                      {selectedProject.total > 0
                        ? Math.round(
                            (selectedProject.completed /
                              selectedProject.total) *
                              100,
                          )
                        : 0}
                      %
                    </span>
                    {isAdminRole(user?.role) && !selectedProject.archived && (
                      <>
                        <button
                          onClick={() => setShowNewProjectTask(true)}
                          className="btn btn-secondary btn-sm"
                        >
                          <svg
                            className="mr-2 h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
                          Dodaj zadanie
                        </button>
                        <button
                          onClick={() =>
                            void completeProject(selectedProject.id)
                          }
                          disabled={!selectedProject.readyToComplete}
                          title={
                            !selectedProject.readyToComplete
                              ? "Najpierw spełnij checklistę gotowości"
                              : undefined
                          }
                          className="btn btn-primary btn-sm disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Zakończ projekt
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {!selectedProject.archived && (
                  <div className="mb-4 rounded-lg border border-border p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Checklist zakończenia
                      </h4>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          selectedProject.readyToComplete
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                        }`}
                      >
                        {selectedProject.readyToComplete ? "Gotowy" : "W toku"}
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {completionChecks.map((check) => (
                        <div
                          key={check.label}
                          className="rounded-md border border-border px-2 py-2"
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${check.done ? "bg-green-500" : "bg-amber-500"}`}
                            />
                            <p className="truncate text-xs font-medium text-gray-900 dark:text-white">
                              {check.label}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {check.detail}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedProject.tasks.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    <p>Ten projekt nie ma jeszcze zadań.</p>
                    {isAdminRole(user?.role) && !selectedProject.archived && (
                      <button
                        onClick={() => setShowNewProjectTask(true)}
                        className="btn btn-primary btn-sm mt-3"
                      >
                        Dodaj pierwsze zadanie
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedProject.tasks
                      .slice()
                      .sort(compareProjectTasks)
                      .map((task) => (
                        <ProjectTaskRow
                          key={task.id}
                          task={task}
                          onOpen={() => setSelectedTask(task)}
                          onComplete={() => void toggleTaskComplete(task.id)}
                        />
                      ))}
                  </div>
                )}
              </section>
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
                {selectedProject && (
                  <div className="rounded-lg border border-border p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Członkowie projektu
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {selectedProject.members.length}
                      </span>
                    </div>
                    {allUsers.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Brak użytkowników do przypisania.
                      </p>
                    ) : (
                      <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                        {allUsers.map((member) => (
                          <label
                            key={member.id}
                            className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-gray-700 hover:bg-muted dark:text-gray-200"
                          >
                            <input
                              type="checkbox"
                              checked={selectedProjectMemberIds.includes(
                                String(member.id),
                              )}
                              onChange={() =>
                                setSelectedProjectMemberIds((ids) =>
                                  toggleStringId(ids, String(member.id)),
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
                      onClick={() => void updateProjectMembers()}
                      disabled={!selectedProject || selectedProject.archived}
                      className="btn btn-secondary btn-sm mt-3 w-full disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Zapisz członków
                    </button>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Projekt docelowy
                  </label>
                  <select
                    value={targetProjectId}
                    onChange={(event) => setTargetProjectId(event.target.value)}
                    disabled={activeProjects.length === 0}
                    className="input"
                  >
                    {activeProjects.length === 0 ? (
                      <option value="">Brak aktywnych projektów</option>
                    ) : (
                      activeProjects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Zadanie
                  </label>
                  <select
                    value={taskToAssignId}
                    onChange={(event) => setTaskToAssignId(event.target.value)}
                    disabled={assignableTasks.length === 0}
                    className="input"
                  >
                    {assignableTasks.length === 0 ? (
                      <option value="">Brak zadań do przeniesienia</option>
                    ) : (
                      assignableTasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.title} ({task.project})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <button
                  onClick={() => void assignTaskToProject()}
                  disabled={
                    activeProjects.length === 0 ||
                    !targetProjectId ||
                    !taskToAssignId
                  }
                  className="btn btn-primary btn-sm w-full"
                >
                  Przypisz do projektu
                </button>
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
            onDelete={(id) => void deleteTask(id)}
            onComplete={(id) => void toggleTaskComplete(id)}
            onUpdate={(task) => void updateTask(task)}
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
            onSubmit={(data) => void createTaskInSelectedProject(data)}
            onCancel={() => setShowNewProjectTask(false)}
          />
        </Modal>
      )}

      {showNewProject && (
        <Modal onClose={() => setShowNewProject(false)}>
          <form onSubmit={(event) => void createProject(event)} className="p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Nowy projekt
            </h3>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Nazwa projektu *
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  className="input"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Opis
                </label>
                <textarea
                  value={newProjectDescription}
                  onChange={(event) =>
                    setNewProjectDescription(event.target.value)
                  }
                  className="input min-h-[88px]"
                  maxLength={500}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Kolor
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={newProjectColor}
                    onChange={(event) => setNewProjectColor(event.target.value)}
                    className="h-10 w-14 rounded-md border border-border bg-background p-1"
                  />
                  <input
                    type="text"
                    value={newProjectColor}
                    onChange={(event) => setNewProjectColor(event.target.value)}
                    className="input"
                    pattern="#[0-9a-fA-F]{6}"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Członkowie projektu
                </label>
                {allUsers.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                    Brak użytkowników do przypisania.
                  </p>
                ) : (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                    {allUsers.map((member) => (
                      <label
                        key={member.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-gray-700 hover:bg-muted dark:text-gray-200"
                      >
                        <input
                          type="checkbox"
                          checked={newProjectMemberIds.includes(
                            String(member.id),
                          )}
                          onChange={() =>
                            setNewProjectMemberIds((ids) =>
                              toggleStringId(ids, String(member.id)),
                            )
                          }
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="truncate">{member.username}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowNewProject(false)}
                className="btn btn-secondary btn-sm"
              >
                Anuluj
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                Utwórz projekt
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function buildProjectSummary(project: Project): ProjectSummary {
  const tasks = project.tasks ?? [];
  const today = new Date(new Date().toDateString());
  const openTasks = tasks.filter((task) => !task.completed);
  const nextDueDate =
    openTasks
      .map((task) => task.due_date)
      .filter((date): date is string => Boolean(date))
      .sort()[0] ?? null;

  return {
    ...project,
    tasks,
    total: tasks.length,
    completed: tasks.filter((task) => task.completed).length,
    open: openTasks.length,
    blocked: openTasks.filter((task) => task.is_blocked).length,
    overdue: tasks.filter(
      (task) =>
        task.due_date && !task.completed && new Date(task.due_date) < today,
    ).length,
    highPriority: openTasks.filter((task) => task.priority === "high").length,
    nextDueDate,
    readyToComplete: openTasks.length === 0,
  };
}

function compareProjectTasks(a: Task, b: Task) {
  if (a.completed !== b.completed) return a.completed ? 1 : -1;
  const priorityRank = { high: 0, medium: 1, low: 2 };
  if (priorityRank[a.priority] !== priorityRank[b.priority])
    return priorityRank[a.priority] - priorityRank[b.priority];
  return (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31");
}

function toggleStringId(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function ProjectTaskRow({
  task,
  onOpen,
  onComplete,
}: {
  task: Task;
  onOpen: () => void;
  onComplete: () => void;
}) {
  const completedSubtasks = task.subtasks.filter(
    (subtask) => subtask.completed,
  ).length;
  const openSubtasks = task.subtasks.length - completedSubtasks;
  const completionBlocked =
    !task.completed && (task.is_blocked || openSubtasks > 0);
  const completionTitle = task.completed
    ? "Przywróć"
    : task.is_blocked
      ? "Najpierw zakończ blokujące zadania"
      : openSubtasks > 0
        ? `Najpierw zakończ podzadania: ${openSubtasks}`
        : "Zakończ";

  return (
    <div className="rounded-lg border border-border p-3 transition-colors hover:bg-muted/30">
      <div className="flex items-start justify-between gap-3">
        <button
          onClick={onOpen}
          className={`min-w-0 flex-1 text-left text-sm font-semibold hover:text-primary ${task.completed ? "line-through text-muted-foreground" : "text-gray-900 dark:text-white"}`}
        >
          {task.title}
        </button>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${priorityClass(task.priority)}`}
        >
          {priorityLabel(task.priority)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {task.due_date && <span>{formatShortDate(task.due_date)}</span>}
        <span>
          {task.assignees.length > 0
            ? task.assignees.map((assignee) => assignee.username).join(", ")
            : "Nieprzypisane"}
        </span>
        {completionBlocked && (
          <span className="font-medium text-amber-700 dark:text-amber-300">
            Zablokowane
          </span>
        )}
      </div>

      <button
        onClick={onComplete}
        disabled={completionBlocked}
        title={completionTitle}
        className={`btn btn-sm mt-3 w-full ${task.completed ? "btn-secondary" : "btn-primary"} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {task.completed ? "Przywróć" : "Zakończ"}
      </button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-right">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function ProjectStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "danger" | "warning";
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-700 dark:text-red-300"
      : tone === "warning"
        ? "text-amber-700 dark:text-amber-300"
        : "text-gray-900 dark:text-white";

  return (
    <div className="rounded-md border border-border px-2 py-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`truncate text-xs font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}


