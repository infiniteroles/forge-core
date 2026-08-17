"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Action = "ready" | "in_progress" | "done" | "cancelled";

export function TaskStatusButton({
  taskId,
  action,
  label,
  className,
}: {
  taskId: string;
  action: Action;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (loading) return;
    setLoading(true);

    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: action }),
    });

    if (res.ok) {
      router.refresh();
    } else {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={
        className ??
        "rounded-md border border-border px-2 py-1 text-xs text-neutral-300 transition hover:border-accent/50 disabled:opacity-50"
      }
    >
      {loading ? "…" : label}
    </button>
  );
}
