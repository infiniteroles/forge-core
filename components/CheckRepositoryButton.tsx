"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CheckRepositoryButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onClick() {
    if (loading) return;
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/repository/check`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        setMessage("Repository checked.");
        router.refresh();
      } else {
        setError(data.error || "Could not check the repository.");
      }
    } catch {
      setError("Network error while checking the repository.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClick}
          disabled={loading}
          className="rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
        >
          {loading ? "Checking…" : "Check repository"}
        </button>
      </div>
      {message ? <p className="text-xs text-emerald-300">{message}</p> : null}
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
