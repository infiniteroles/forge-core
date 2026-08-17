"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_TYPES,
  TASK_TYPE_LABELS,
} from "@/lib/task";

type TaskProps = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  status: string;
  assignedAgent: string | null;
  notes: string | null;
};

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-neutral-100 placeholder:text-text-dim/60 focus:border-accent/60 focus:outline-none";

export function TaskForm({ task }: { task: TaskProps }) {
  const router = useRouter();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [type, setType] = useState(task.type);
  const [priority, setPriority] = useState(task.priority);
  const [status, setStatus] = useState(task.status);
  const [assignedAgent, setAssignedAgent] = useState(task.assignedAgent ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        type,
        priority,
        status,
        assignedAgent,
        notes,
      }),
    });

    if (res.ok) {
      router.push(`/projects/${task.projectId}`);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save the task. Check the fields.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-text-dim" htmlFor="title">
          Title
        </label>
        <input
          id="title"
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-text-dim" htmlFor="type">
            Type
          </label>
          <select
            id="type"
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {TASK_TYPES.map((option) => (
              <option key={option} value={option} className="bg-surface">
                {TASK_TYPE_LABELS[option] ?? option}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-text-dim" htmlFor="priority">
            Priority
          </label>
          <select
            id="priority"
            className={inputClass}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            {TASK_PRIORITIES.map((option) => (
              <option key={option} value={option} className="bg-surface">
                {TASK_PRIORITY_LABELS[option] ?? option}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-text-dim" htmlFor="status">
            Status
          </label>
          <select
            id="status"
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {TASK_STATUSES.map((option) => (
              <option key={option} value={option} className="bg-surface">
                {TASK_STATUS_LABELS[option] ?? option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-text-dim" htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          className={`${inputClass} min-h-20 resize-y`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-text-dim" htmlFor="assignedAgent">
            Assigned agent
          </label>
          <input
            id="assignedAgent"
            className={inputClass}
            value={assignedAgent}
            onChange={(e) => setAssignedAgent(e.target.value)}
            placeholder="planner, builder, qa, infra…"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-text-dim" htmlFor="notes">
            Notes
          </label>
          <input
            id="notes"
            className={inputClass}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-border px-4 py-2 text-sm text-neutral-300 transition hover:border-accent/50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
