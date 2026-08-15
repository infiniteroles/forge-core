"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InstructionForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/instructions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, content, source: "manual" }),
    });

    if (res.ok) {
      setContent("");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not add the instruction.");
    }
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <textarea
        className="min-h-24 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-neutral-100 placeholder:text-text-dim/60 focus:border-accent/60 focus:outline-none"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Describe what needs to happen next… (min. 10 characters)"
        required
      />

      <div>
        <button
          type="submit"
          disabled={loading || content.trim().length < 10}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Adding…" : "Add instruction"}
        </button>
      </div>
    </form>
  );
}
