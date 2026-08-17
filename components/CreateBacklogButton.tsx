"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateBacklogButton({
  agentRunId,
  alreadyCreated,
}: {
  agentRunId: string;
  alreadyCreated: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (alreadyCreated) {
    return (
      <span className="text-xs text-text-dim">Backlog already created</span>
    );
  }

  async function onClick() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/agent-runs/${agentRunId}/create-backlog`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        router.refresh();
      } else {
        setError(data.error || "Could not create the backlog.");
      }
    } catch {
      setError("Network error while creating the backlog.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
      >
        {loading ? "Creating…" : "Create Backlog"}
      </button>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
