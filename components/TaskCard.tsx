import Link from "next/link";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
  TASK_TYPE_LABELS,
} from "@/lib/task";
import { TaskStatusButton } from "./TaskStatusButton";

type TaskProps = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  status: string;
  sortOrder: number;
  assignedAgent: string | null;
  sourceAgentRunId: string | null;
};

export function TaskCard({ task }: { task: TaskProps }) {
  const tone =
    TASK_STATUS_TONES[task.status] ?? "bg-neutral-700/40 text-neutral-300";
  const done = task.status === "done";
  const cancelled = task.status === "cancelled";

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`text-sm font-medium ${
            done ? "text-neutral-400 line-through" : "text-neutral-100"
          }`}
        >
          {task.title}
        </span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}
        >
          {TASK_STATUS_LABELS[task.status] ?? task.status}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-text-dim">
        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">
          {TASK_TYPE_LABELS[task.type] ?? task.type}
        </span>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">
          {TASK_PRIORITY_LABELS[task.priority] ?? task.priority}
        </span>
        {task.assignedAgent ? (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">
            @{task.assignedAgent}
          </span>
        ) : null}
        {task.sourceAgentRunId ? (
          <span className="text-accent">from Planner</span>
        ) : null}
      </div>

      {task.description ? (
        <p className="mt-2 line-clamp-2 text-sm text-neutral-300">
          {task.description}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={`/tasks/${task.id}/edit`}
          className="rounded-md border border-border px-2 py-1 text-xs text-neutral-300 transition hover:border-accent/50"
        >
          Edit
        </Link>

        {!cancelled ? (
          <>
            {!done && task.status !== "in_progress" ? (
              <TaskStatusButton
                taskId={task.id}
                action="in_progress"
                label="Start"
              />
            ) : null}
            {!done ? (
              <TaskStatusButton
                taskId={task.id}
                action="done"
                label="Done"
                className="rounded-md border border-emerald-500/40 px-2 py-1 text-xs text-emerald-300 transition hover:bg-emerald-500/10 disabled:opacity-50"
              />
            ) : null}
            <TaskStatusButton
              taskId={task.id}
              action="cancelled"
              label="Cancel"
              className="rounded-md border border-border px-2 py-1 text-xs text-neutral-400 transition hover:border-red-500/50 disabled:opacity-50"
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
