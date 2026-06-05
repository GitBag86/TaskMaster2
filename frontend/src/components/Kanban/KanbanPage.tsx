import { useState, useEffect, useCallback } from "react";
import type { Task } from "@/types";
import { api } from "@/api/client";
import { useToast } from "@/store/ToastContext";
import { useSocket } from "@/store/SocketContext";
import { KanbanSkeleton } from "@/components/common/Skeletons";
import { priorityLabel, priorityClass, formatShortDate, isOverdue } from "@/utils/helpers";

const columns = [
  {
    key: "todo" as const,
    label: "Do zrobienia",
    border: "border-gray-300 dark:border-gray-600",
    bg: "bg-slate-50 dark:bg-slate-900/30",
  },
  {
    key: "in_progress" as const,
    label: "W toku",
    border: "border-blue-400 dark:border-blue-500",
    bg: "bg-blue-50/70 dark:bg-blue-950/20",
  },
  {
    key: "done" as const,
    label: "Zakończone",
    border: "border-green-400 dark:border-green-500",
    bg: "bg-green-50/70 dark:bg-green-950/20",
  },
] as const;

export default function KanbanPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [activeColumn, setActiveColumn] = useState<Task["status"] | null>(null);

  const { addToast } = useToast();
  const { lastTaskEvent } = useSocket();

  const fetchTasks = useCallback(async () => {
    try {
      const response = await api.tasks.getAll(1, 200);
      setTasks(response.tasks);
    } catch {
      addToast("Błąd ładowania zadań", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    if (!lastTaskEvent) return;

    if (
      lastTaskEvent.task &&
      [
        "created",
        "updated",
        "completed",
        "reopened",
        "commented",
        "mentioned",
        "subtask_created",
        "subtask_completed",
        "subtask_reopened",
        "subtask_deleted",
        "dependency_added",
        "dependency_removed",
      ].includes(lastTaskEvent.action)
    ) {
      const updatedTask = lastTaskEvent.task;
      setTasks((prev) => {
        const index = prev.findIndex(
          (task) => task.id === lastTaskEvent.task_id,
        );
        if (index === -1) return [updatedTask, ...prev];
        const next = [...prev];
        next[index] = updatedTask;
        return next;
      });
      return;
    }

    if (lastTaskEvent.action === "deleted" && lastTaskEvent.task_id) {
      setTasks((prev) =>
        prev.filter((task) => task.id !== lastTaskEvent.task_id),
      );
      return;
    }

    if (
      lastTaskEvent.task_ids &&
      ["bulk_deleted", "bulk_completed", "bulk_updated"].includes(
        lastTaskEvent.action,
      )
    ) {
      void fetchTasks();
    }
  }, [fetchTasks, lastTaskEvent]);

  const handleDrop = async (event: React.DragEvent, status: Task["status"]) => {
    event.preventDefault();

    const taskId = Number(event.dataTransfer.getData("taskId"));
    if (!taskId) {
      setActiveColumn(null);
      return;
    }

    const currentTask = tasks.find((task) => task.id === taskId);
    if (!currentTask || currentTask.status === status) {
      setActiveColumn(null);
      setDraggedTaskId(null);
      return;
    }

    if (status === "done" && currentTask.is_blocked) {
      addToast("Najpierw zakończ zadania blokujące", "warning");
      setActiveColumn(null);
      setDraggedTaskId(null);
      return;
    }

    try {
      const updatedTask = await api.tasks.update(taskId, {
        status,
        completed: status === "done",
      });
      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? updatedTask : task)),
      );
      if (status === "done") {
        void fetchTasks();
      }
      addToast("Status zaktualizowany", "success");
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : "Błąd aktualizacji",
        "error",
      );
    } finally {
      setActiveColumn(null);
      setDraggedTaskId(null);
    }
  };

  const handleDragStart = (event: React.DragEvent, taskId: number) => {
    event.dataTransfer.setData("taskId", String(taskId));
    setDraggedTaskId(taskId);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setActiveColumn(null);
  };

  const completedCount = tasks.filter((task) => task.completed).length;
  const blockedCount = tasks.filter(
    (task) => task.is_blocked && !task.completed,
  ).length;

  if (loading) {
    return <KanbanSkeleton />;
  }

  return (
    <div className="space-y-5 page-enter">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Kanban
          </h2>
          <p className="text-sm text-muted-foreground">
            Przeciągnij zadanie między kolumnami, aby zmienić status.
          </p>
        </div>
        <div className="flex gap-2">
          <StatChip label="Wszystkie" value={tasks.length} />
          <StatChip label="Zablokowane" value={blockedCount} tone="warning" />
          <StatChip label="Zakończone" value={completedCount} tone="success" />
        </div>
      </div>

      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 sm:snap-none">
        {columns.map((column) => {
          const columnTasks = tasks.filter(
            (task) => task.status === column.key,
          );

          return (
            <section
              key={column.key}
              className={`min-w-[85vw] sm:min-w-[290px] flex-1 snap-start rounded-xl border border-border border-t-4 p-3 ${column.border} ${column.bg} ${activeColumn === column.key ? "ring-2 ring-primary/40" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setActiveColumn(column.key);
              }}
              onDrop={(event) => void handleDrop(event, column.key)}
            >
              <header className="sticky top-0 z-10 mb-3 rounded-md bg-inherit py-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {column.label}
                  </h3>
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-white/10 dark:text-gray-300">
                    {columnTasks.length}
                  </span>
                </div>
              </header>

              <div className="space-y-2.5">
                {columnTasks.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    Brak zadań w tej kolumnie.
                  </div>
                ) : (
                  columnTasks.map((task) => (
                    <article
                      key={task.id}
                      draggable
                      onDragStart={(event) => handleDragStart(event, task.id)}
                      onDragEnd={handleDragEnd}
                      className={`cursor-grab rounded-lg border border-border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${draggedTaskId === task.id ? "opacity-70 ring-2 ring-primary/30" : ""}`}
                    >
                      <p
                        className={`mb-2 text-sm font-semibold ${task.completed ? "line-through text-muted-foreground" : "text-gray-900 dark:text-white"}`}
                      >
                        {task.title}
                      </p>

                      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="truncate">{task.project}</span>
                        {task.due_date && (
                          <span
                            className={
                              isOverdue(task.due_date, task.completed)
                                ? "font-medium text-destructive"
                                : ""
                            }
                          >
                            {formatShortDate(task.due_date)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${priorityClass(task.priority)}`}
                        >
                          {priorityLabel(task.priority)}
                        </span>
                        {task.is_blocked && !task.completed && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                            Zablokowane
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          {task.assignees.length > 0
                            ? task.assignees[0].username
                            : "Nieprzypisane"}
                        </span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}



function StatChip({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass = {
    default: "border-border bg-card text-foreground",
    success:
      "border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300",
    warning:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300",
  }[tone];

  return (
    <div className={`rounded-lg border px-3 py-2 text-right ${toneClass}`}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
