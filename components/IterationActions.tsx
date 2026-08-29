"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";

interface IterationResultData {
  prUrl?: string | null;
  builderCommitUrl?: string | null;
  filesChanged?: string[];
  warnings?: string[];
  summary?: string | null;
}

/**
 * High-level iteration controls for a task/work session:
 * - "Continue": resumes from the current state using the default instruction
 *   (or the given work session id to chain sessions).
 * - "Ask for changes": opens a small form and starts a new iteration session
 *   with the user's concrete instruction.
 * Both create a NEW linked WorkSession (mode=iteration) — never overwrite.
 */
export function IterationActions({
  taskId,
  workSessionId,
  compact = false,
}: {
  taskId: string;
  workSessionId?: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<{
    id: string;
    status: string;
    summary: string | null;
    result?: IterationResultData | null;
  } | null>(null);

  async function runIteration(body: Record<string, unknown>) {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/work-session/iterate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.workSession) {
        setSession({
          id: data.workSession.id,
          status: data.workSession.status,
          summary: data.workSession.summary,
          result: data.workSession.result as IterationResultData | null,
        });
        setAskOpen(false);
        setInstruction("");
        router.refresh();
      } else {
        setError(data.error || "Iteration request failed.");
      }
    } catch {
      setError("Network error while running the iteration.");
    } finally {
      setLoading(false);
    }
  }

  async function continueSession() {
    if (workSessionId) {
      await runIterationFromSession();
    } else {
      await runIteration({
        instruction:
          "Continue from the current state of this task and apply the next safe, useful development step. Keep changes small and scoped.",
      });
    }
  }

  async function runIterationFromSession() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/work-sessions/${workSessionId}/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.workSession) {
        setSession({
          id: data.workSession.id,
          status: data.workSession.status,
          summary: data.workSession.summary,
          result: data.workSession.result as IterationResultData | null,
        });
        router.refresh();
      } else {
        setError(data.error || "Continue request failed.");
      }
    } catch {
      setError("Network error while continuing the work session.");
    } finally {
      setLoading(false);
    }
  }

  async function submitAskForChanges() {
    const trimmed = instruction.trim();
    if (!trimmed) return;
    await runIteration({ instruction: trimmed });
  }

  const prUrl = session?.result?.prUrl ?? null;

  return (
    <div className="mt-2 flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={continueSession}
          disabled={loading}
          className="rounded-md border border-accent/50 px-2.5 py-1 text-xs text-accent transition hover:bg-accent/10 disabled:opacity-50"
        >
          {loading ? "Working…" : "Continue"}
        </button>
        <button
          type="button"
          onClick={() => setAskOpen((v) => !v)}
          disabled={loading}
          className="rounded-md border border-accent/50 px-2.5 py-1 text-xs text-accent transition hover:bg-accent/10 disabled:opacity-50"
        >
          Ask for changes
        </button>
        {session ? (
          <Link
            href={`/work-sessions/${session.id}`}
            className="text-xs text-accent transition hover:underline"
          >
            View session
          </Link>
        ) : null}
        {session ? (
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
              session.status === "completed"
                ? "bg-emerald-500/10 text-emerald-300"
                : session.status === "waiting_for_user"
                  ? "bg-amber-500/10 text-amber-300"
                  : session.status === "failed"
                    ? "bg-red-500/10 text-red-300"
                    : "bg-sky-500/10 text-sky-300"
            }`}
          >
            {session.status}
          </span>
        ) : null}
        {prUrl ? (
          <a
            href={prUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent transition hover:underline"
          >
            Open PR
          </a>
        ) : null}
      </div>

      {askOpen ? (
        <div className="w-full rounded-lg border border-border bg-background p-3">
          <label className="text-xs font-semibold text-neutral-200">
            What should Forge change?
          </label>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={3}
            placeholder="Example: Add a timestamp field to the response and keep the rest unchanged."
            className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent/60 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={submitAskForChanges}
              disabled={loading || !instruction.trim()}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Starting…" : "Start iteration"}
            </button>
            <button
              type="button"
              onClick={() => setAskOpen(false)}
              className="rounded-md border border-border px-2 py-1 text-xs text-neutral-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {session?.summary ? (
        <pre
          className={`w-full whitespace-pre-wrap rounded-md border border-border bg-background p-2 text-xs text-neutral-300 ${
            compact ? "max-h-32 overflow-auto" : ""
          }`}
        >
          {session.summary}
        </pre>
      ) : null}

      {session?.result?.warnings && session.result.warnings.length > 0 ? (
        <div className="flex w-full flex-col gap-1">
          {session.result.warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-1.5 text-xs text-amber-300">
              <Icon name="warning" className="mt-[1px] shrink-0 text-[14px] leading-none" /> {w}
            </p>
          ))}
        </div>
      ) : null}

      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
