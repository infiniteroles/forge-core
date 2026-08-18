"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function IdeaForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || idea.trim().length < 10) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/ideas/work-session/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idea: idea.trim() }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.workSession) {
        setIdea("");
        router.push(`/work-sessions/${data.workSession.id}`);
        router.refresh();
      } else {
        setError(data.error || "Could not start the work session.");
      }
    } catch {
      setError("Network error while starting the work session.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col items-start gap-2">
      <textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        rows={2}
        placeholder="Describe what you want Forge to build or change…"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-neutral-200 outline-none transition placeholder:text-text-dim focus:border-accent/60"
      />
      <button
        type="submit"
        disabled={loading || idea.trim().length < 10}
        className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Working on this…" : "Start DEV Work Session"}
      </button>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </form>
  );
}
