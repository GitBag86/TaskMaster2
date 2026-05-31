import { useEffect, useMemo, useState } from "react";
import type {
  ActivityLog,
  Task,
  Subtask,
  TaskDependency,
  TaskSummary,
} from "@/types";
import { isAdminRole } from "@/types";
import { api } from "@/api/client";
import { useToast } from "@/store/ToastContext";
import { useAuth } from "@/store/AuthContext";
import TaskForm from "./TaskForm";

interface Props {
  task: Task;
  onDelete: (id: number) => void;
  onComplete: (id: number) => void;
  onUpdate: (task: Task) => void;
  onClose: () => void;
}

interface TaskFormData {
  title: string;
  assignee_ids?: number[];
  priority?: "low" | "medium" | "high";
  project?: string;
  due_date?: string;
  notes?: string;
}

export default function TaskDetail({
  task,
  onDelete,
  onComplete,
  onUpdate,
  onClose,
}: Props) {
  const [subtasks, setSubtasks] = useState(task.subtasks);
  const [newSubtask, setNewSubtask] = useState("");
  const [newComment, setNewComment] = useState("");
  const [comments, setComments] = useState(task.comments);
  const [isEditing, setIsEditing] = useState(false);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [dependencies, setDependencies] = useState<TaskDependency[]>(
    task.dependencies,
  );
  const [blockedBy, setBlockedBy] = useState<TaskSummary[]>(task.blocked_by);
  const [blocking, setBlocking] = useState<TaskSummary[]>(task.blocking);
  const [availableTasks, setAvailableTasks] = useState<TaskSummary[]>([]);
  const [selectedDependencyId, setSelectedDependencyId] = useState("");
  const { addToast } = useToast();
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  useEffect(() => {
    setSubtasks(task.subtasks);
    setComments(task.comments);
    setDependencies(task.dependencies);
    setBlockedBy(task.blocked_by);
    setBlocking(task.blocking);
  }, [
    task.blocked_by,
    task.blocking,
    task.comments,
    task.dependencies,
    task.subtasks,
  ]);

  useEffect(() => {
    const loadActivity = async () => {
      try {
        const response = await api.activity.getForTask(task.id);
        setActivity(response.activity);
      } catch {
        setActivity([]);
      }
    };

    void loadActivity();
  }, [task.id]);

  useEffect(() => {
    if (!isAdminRole(user?.role)) return;

    const loadAvailableTasks = async () => {
      try {
        const response = await api.tasks.getAll(1, 200);
        setAvailableTasks(
          response.tasks.map((taskOption) => ({
            id: taskOption.id,
            title: taskOption.title,
            status: taskOption.status,
            completed: taskOption.completed,
            project: taskOption.project,
            due_date: taskOption.due_date,
          })),
        );
      } catch {
        setAvailableTasks([]);
      }
    };

    void loadAvailableTasks();
  }, [isAdmin]);

  const completedSubtasks = useMemo(
    () => subtasks.filter((subtask) => subtask.completed).length,
    [subtasks],
  );

  const handleAddSubtask = async () => {
    if (!newSubtask.trim()) return;
    try {
      const subtask = await api.subtasks.add(task.id, newSubtask);
      setSubtasks((prev) => [...prev, subtask]);
      setNewSubtask("");
      void reloadActivity(task.id, setActivity);
      addToast("Podzadanie dodane", "success");
    } catch {
      addToast("Błąd dodawania podzadania", "error");
    }
  };

  const handleToggleSubtask = async (subtask: Subtask) => {
    try {
      await api.subtasks.complete(subtask.id);
      setSubtasks((prev) =>
        prev.map((item) =>
          item.id === subtask.id
            ? { ...item, completed: !item.completed }
            : item,
        ),
      );
      void reloadActivity(task.id, setActivity);
    } catch {
      addToast("Błąd zmiany stanu", "error");
    }
  };

  const handleDeleteSubtask = async (id: number) => {
    try {
      await api.subtasks.delete(id);
      setSubtasks((prev) => prev.filter((item) => item.id !== id));
      void reloadActivity(task.id, setActivity);
    } catch {
      addToast("Błąd usuwania", "error");
    }
  };

  const handleStartTask = async () => {
    try {
      const updatedTask = await api.tasks.update(task.id, {
        status: "in_progress",
        completed: false,
      });
      onUpdate(updatedTask);
      addToast("Zadanie ustawione jako w toku", "success");
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd zmiany statusu",
        "error",
      );
    }
  };

  const handleClearAssignee = async () => {
    try {
      const updatedTask = await api.tasks.update(task.id, { assignee_ids: [] });
      onUpdate(updatedTask);
      addToast("Przypisanie usunięte", "success");
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd usuwania przypisania",
        "error",
      );
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      const comment = await api.comments.add(task.id, newComment);
      setComments((prev) => [...prev, comment]);
      setNewComment("");
      void reloadActivity(task.id, setActivity);
    } catch {
      addToast("Błąd dodawania komentarza", "error");
    }
  };

  const assigneeLabel =
    task.assignees.length > 0
      ? task.assignees.map((assignee) => assignee.username).join(", ")
      : "Nieprzypisane";

  const editInitialData: TaskFormData = {
    title: task.title,
    assignee_ids: task.assignees.map((assignee) => assignee.id),
    priority: task.priority,
    project: task.project,
    due_date: task.due_date ?? "",
    notes: task.notes,
  };

  const handleUpdateTask = async (data: TaskFormData) => {
    try {
      const updatedTask = await api.tasks.update(task.id, data);
      onUpdate(updatedTask);
      setIsEditing(false);
      addToast("Zadanie zaktualizowane", "success");
      onClose();
    } catch {
      addToast("Błąd aktualizacji zadania", "error");
    }
  };

  const handleAddDependency = async () => {
    const dependsOnTaskId = Number(selectedDependencyId);
    if (!dependsOnTaskId) return;

    try {
      const updatedTask = await api.tasks.addDependency(
        task.id,
        dependsOnTaskId,
      );
      onUpdate(updatedTask);
      setSelectedDependencyId("");
      void reloadActivity(task.id, setActivity);
      addToast("Zależność dodana", "success");
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd dodawania zależności",
        "error",
      );
    }
  };

  const handleRemoveDependency = async (dependencyId: number) => {
    try {
      const updatedTask = await api.tasks.removeDependency(dependencyId);
      onUpdate(updatedTask);
      void reloadActivity(task.id, setActivity);
      addToast("Zależność usunięta", "success");
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd usuwania zależności",
        "error",
      );
    }
  };

  const existingDependencyIds = new Set(
    dependencies.map((dependency) => dependency.depends_on_task_id),
  );
  const dependencyOptions = availableTasks.filter(
    (taskOption) =>
      taskOption.id !== task.id && !existingDependencyIds.has(taskOption.id),
  );
  const isBlocked = task.is_blocked && !task.completed;
  const openSubtasks = subtasks.length - completedSubtasks;
  const hasOpenSubtasks = !task.completed && openSubtasks > 0;
  const completionBlocked = isBlocked || hasOpenSubtasks;
  const completionBlockedTitle = isBlocked
    ? "Najpierw zakończ blokujące zadania"
    : hasOpenSubtasks
      ? `Najpierw zakończ podzadania: ${openSubtasks}`
      : undefined;
  const canStartTask = !isAdmin && !task.completed && task.status === "todo";

  if (isEditing) {
    return (
      <TaskForm
        initialData={editInitialData}
        submitLabel="Zapisz"
        onSubmit={(data) => void handleUpdateTask(data)}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div className="flex max-h-[80vh] flex-col">
      <div className="border-b border-border p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {task.project}
            </p>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              {task.title}
            </h3>
          </div>
          {isAdminRole(user?.role) && (
            <button
              onClick={() => setIsEditing(true)}
              className="btn btn-secondary btn-sm"
            >
              Edytuj
            </button>
          )}
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <Badge>{priorityLabel(task.priority)}</Badge>
          <Badge>{statusLabel(task.status)}</Badge>
          {isBlocked && (
            <Badge tone="warning">Zablokowane przez {blockedBy.length}</Badge>
          )}
          {hasOpenSubtasks && (
            <Badge tone="warning">Otwarte podzadania: {openSubtasks}</Badge>
          )}
          {task.due_date && <Badge>{task.due_date}</Badge>}
        </div>

        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <div className="flex flex-wrap items-center gap-2">
            <p>
              <span className="font-medium">Przypisani:</span> {assigneeLabel}
            </p>
            {isAdmin && task.assignees.length > 0 && (
              <button
                onClick={() => void handleClearAssignee()}
                className="text-xs font-medium text-destructive hover:underline"
              >
                Usuń przypisanie
              </button>
            )}
          </div>
          <p>
            <span className="font-medium">Utworzono:</span>{" "}
            {formatDateTime(task.created_at)}
          </p>
        </div>
      </div>

      <div className="space-y-6 overflow-y-auto p-5">
        <section className="rounded-lg border border-border p-4">
          <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
            Notatki
          </h4>
          {task.notes ? (
            <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
              {task.notes}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Brak notatek dla tego zadania.
            </p>
          )}
        </section>

        <section className="rounded-lg border border-border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                Zależności
              </h4>
              {isBlocked && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  Zadanie można zakończyć dopiero po zamknięciu blokujących
                  zadań.
                </p>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {dependencies.length}
            </span>
          </div>

          <div className="space-y-2">
            {dependencies.length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak zależności.</p>
            ) : (
              dependencies.map((dependency) => (
                <div
                  key={dependency.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {dependency.depends_on_task?.title ??
                        `Zadanie #${dependency.depends_on_task_id}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dependency.depends_on_task
                        ? summaryMeta(dependency.depends_on_task)
                        : "Szczegóły niedostępne"}
                    </p>
                  </div>
                  {isAdminRole(user?.role) && (
                    <button
                      onClick={() => void handleRemoveDependency(dependency.id)}
                      className="text-xs font-medium text-destructive hover:underline"
                    >
                      Usuń
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {isAdminRole(user?.role) && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select
                value={selectedDependencyId}
                onChange={(event) =>
                  setSelectedDependencyId(event.target.value)
                }
                className="input flex-1"
              >
                <option value="">Dodaj blokujące zadanie</option>
                {dependencyOptions.map((taskOption) => (
                  <option key={taskOption.id} value={taskOption.id}>
                    {taskOption.title}
                  </option>
                ))}
              </select>
              <button
                onClick={() => void handleAddDependency()}
                disabled={!selectedDependencyId}
                className="btn btn-secondary btn-sm"
              >
                Dodaj
              </button>
            </div>
          )}

          {blocking.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Blokuje
              </h5>
              <div className="space-y-1.5">
                {blocking.map((blockedTask) => (
                  <div
                    key={blockedTask.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="truncate text-gray-700 dark:text-gray-300">
                      {blockedTask.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {statusText(blockedTask.status)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
              Podzadania
            </h4>
            <span className="text-xs text-muted-foreground">
              {completedSubtasks}/{subtasks.length}
            </span>
          </div>

          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${subtasks.length > 0 ? (completedSubtasks / subtasks.length) * 100 : 0}%`,
              }}
            />
          </div>

          <div className="space-y-2">
            {subtasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak podzadań.</p>
            ) : (
              subtasks.map((subtask) => (
                <div
                  key={subtask.id}
                  className="flex items-center gap-2 rounded-lg border border-border p-2.5"
                >
                  <input
                    type="checkbox"
                    checked={subtask.completed}
                    onChange={() => void handleToggleSubtask(subtask)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span
                    className={`flex-1 text-sm ${subtask.completed ? "line-through text-muted-foreground" : "text-gray-900 dark:text-white"}`}
                  >
                    {subtask.title}
                  </span>
                  {isAdmin && (
                    <button
                      onClick={() => void handleDeleteSubtask(subtask.id)}
                      className="text-xs font-medium text-destructive hover:underline"
                    >
                      Usuń
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {isAdmin && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={newSubtask}
                onChange={(event) => setNewSubtask(event.target.value)}
                onKeyDown={(event) =>
                  event.key === "Enter" && void handleAddSubtask()
                }
                placeholder="Nowe podzadanie..."
                className="input flex-1"
              />
              <button
                onClick={() => void handleAddSubtask()}
                className="btn btn-secondary btn-sm"
              >
                Dodaj
              </button>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border p-4">
          <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
            Komentarze
          </h4>
          <div className="space-y-2">
            {comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Brak komentarzy.</p>
            ) : (
              comments.map((comment) => (
                <div
                  key={comment.id}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-900 dark:text-white">
                      {comment.author}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(comment.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {comment.text}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(event) => setNewComment(event.target.value)}
              onKeyDown={(event) =>
                event.key === "Enter" && void handleAddComment()
              }
              placeholder="Dodaj komentarz..."
              className="input flex-1"
            />
            <button
              onClick={() => void handleAddComment()}
              className="btn btn-secondary btn-sm"
            >
              Wyślij
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-border p-4">
          <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
            Historia zmian
          </h4>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Brak zapisanej aktywności.
            </p>
          ) : (
            <div className="space-y-3">
              {activity.map((item) => (
                <div
                  key={item.id}
                  className="border-l-2 border-primary/30 pl-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {activityLabel(item.action)}
                    </p>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDateTime(item.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.username ?? "System"}
                  </p>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                    {activityDetails(item)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="border-t border-border bg-card p-4">
        <div className="flex justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {canStartTask && (
              <button
                onClick={() => void handleStartTask()}
                className="btn btn-secondary btn-sm"
              >
                Ustaw w toku
              </button>
            )}
            <button
              onClick={() => onComplete(task.id)}
              disabled={completionBlocked}
              title={completionBlockedTitle}
              className={`btn btn-sm ${task.completed ? "btn-secondary" : "btn-primary"} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {task.completed ? "Przywróć zadanie" : "Oznacz jako zakończone"}
            </button>
          </div>
          {isAdminRole(user?.role) && (
            <div className="flex gap-2">
              <button
                onClick={() => onDelete(task.id)}
                className="btn btn-destructive btn-sm"
              >
                Usuń zadanie
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function priorityLabel(priority: string) {
  return (
    {
      high: "Priorytet: wysoki",
      medium: "Priorytet: średni",
      low: "Priorytet: niski",
    }[priority] || priority
  );
}

function statusLabel(status: string) {
  return `Status: ${statusText(status)}`;
}

function statusText(status: string) {
  return (
    { todo: "do zrobienia", in_progress: "w toku", done: "zakończone" }[
      status
    ] || status
  );
}

function summaryMeta(task: TaskSummary) {
  const status = statusText(task.status);
  const dueDate = task.due_date
    ? `, termin: ${new Date(task.due_date).toLocaleDateString("pl-PL")}`
    : "";
  return `${task.project} - ${status}${dueDate}`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pl-PL");
}

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "warning";
}) {
  const className =
    tone === "warning"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return <span className={`badge ${className}`}>{children}</span>;
}

async function reloadActivity(
  taskId: number,
  setActivity: React.Dispatch<React.SetStateAction<ActivityLog[]>>,
) {
  try {
    const response = await api.activity.getForTask(taskId);
    setActivity(response.activity);
  } catch {
    setActivity([]);
  }
}

function activityLabel(action: string) {
  return (
    {
      created: "Utworzono zadanie",
      updated: "Zaktualizowano zadanie",
      completed: "Zakończono zadanie",
      reopened: "Przywrócono zadanie",
      commented: "Dodano komentarz",
      mentioned: "Dodano wzmiankę",
      subtask_created: "Dodano podzadanie",
      subtask_toggle: "Zmieniono podzadanie",
      subtask_deleted: "Usunięto podzadanie",
      dependency_added: "Dodano zależność",
      dependency_removed: "Usunięto zależność",
    }[action] || action
  );
}

function activityDetails(item: ActivityLog) {
  const details = item.details ?? {};
  const changes = details.changes;

  if (changes && typeof changes === "object" && !Array.isArray(changes)) {
    const labels = Object.entries(
      changes as Record<string, { from?: unknown; to?: unknown }>,
    ).map(
      ([field, change]) =>
        `${fieldLabel(field)}: ${formatChangeValue(change.from)} -> ${formatChangeValue(change.to)}`,
    );
    return labels.join(", ") || "Zmieniono dane zadania.";
  }

  if (typeof details.title === "string") return details.title;
  if (typeof details.text === "string") return details.text;
  if (typeof details.subtask === "string") return details.subtask;
  return "Zapisano zdarzenie.";
}

function fieldLabel(field: string) {
  return (
    {
      title: "Tytuł",
      priority: "Priorytet",
      project: "Projekt",
      project_id: "Projekt",
      due_date: "Termin",
      notes: "Notatki",
      completed: "Ukończone",
      status: "Status",
      assignee_ids: "Przypisani",
    }[field] || field
  );
}

function formatChangeValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.join(", ") || "-";
  if (typeof value === "boolean") return value ? "tak" : "nie";
  return String(value);
}
