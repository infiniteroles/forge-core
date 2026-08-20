"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunSessionChecksButton({ workSessionId }: { workSessionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/work-sessions/${workSessionId}/checks/run`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        router.refresh();
      } else {
        setError(data.error || "Session checks request failed.");
      }
    } catch {
      setError("Network error while running session checks.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="rounded-md border border-accent/50 px-2 py-1 text-xs text-accent transition hover:bg-accent/10 disabled:opacity-50"
      >
        {loading ? "Running checks…" : "Run checks"}
      </button>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
