"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AskPlannerButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/planner`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        router.refresh();
      } else {
        setError(data.error || "The planner could not be run.");
        router.refresh();
      }
    } catch {
      setError("Network error while contacting the planner.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Planning…" : "Ask Planner"}
      </button>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
