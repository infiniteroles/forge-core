"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IterationActions } from "./IterationActions";

interface WorkSessionResultData {
  taskId?: string;
  issueUrl?: string | null;
  branchUrl?: string | null;
  planCommitUrl?: string | null;
  prUrl?: string | null;
  builderCommitUrl?: string | null;
  prReviewRecommendation?: string | null;
  filesChanged?: string[];
  summary?: string | null;
  warnings?: string[];
}

export function WorkSessionButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<{
    id: string;
    status: string;
    summary: string | null;
    result?: WorkSessionResultData | null;
  } | null>(null);

  async function start() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/work-session/start`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.workSession) {
        setSession({
          id: data.workSession.id,
          status: data.workSession.status,
          summary: data.workSession.summary,
          result: data.workSession.result as WorkSessionResultData | null,
        });
        router.refresh();
      } else {
        setError(data.error || "Work session request failed.");
      }
    } catch {
      setError("Network error while starting the work session.");
    } finally {
      setLoading(false);
    }
  }

  const prUrl = session?.result?.prUrl ?? null;

  return (
    <div className="mt-2 flex flex-col items-start gap-1.5">
      {!session ? (
        <button
          type="button"
          onClick={start}
          disabled={loading}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Working on this…" : "Work on this"}
        </button>
      ) : null}

      {session ? (
        <div className="w-full rounded-lg border border-border bg-background p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-neutral-100">Work session</span>
            <span
              className={`rounded px-1.5 py-0.5 font-mono ${
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
            <Link
              href={`/work-sessions/${session.id}`}
              className="text-accent transition hover:underline"
            >
              View session
            </Link>
            {prUrl ? (
              <a
                href={prUrl}
                target="_blank"
                rel="noreferrer"
                className="text-accent transition hover:underline"
              >
                Open PR
              </a>
            ) : null}
          </div>
          {session.status === "waiting_for_user" ? (
            <p className="mt-2 text-xs text-amber-300">
              Forge needs your input before continuing.
            </p>
          ) : null}
          {session.summary ? (
            <pre className="mt-2 whitespace-pre-wrap text-xs text-neutral-300">
              {session.summary}
            </pre>
          ) : null}
          {session.result?.warnings && session.result.warnings.length > 0 ? (
            <div className="mt-2 flex flex-col gap-1">
              {session.result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-300">
                  ⚠ {w}
                </p>
              ))}
            </div>
          ) : null}
          <div className="mt-3">
            <IterationActions
              taskId={taskId}
              workSessionId={session.id}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-border px-2 py-1 text-xs text-text-dim">
                Discard — coming soon
              </span>
              <span className="rounded-md border border-border px-2 py-1 text-xs text-text-dim">
                Prepare production — coming soon
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
