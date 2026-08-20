/**
 * Production Readiness — preview resolver (Fase 3.8C).
 *
 * Resolves the best ready DEV preview for a task even when the current work
 * session does not own a PreviewDeployment (e.g. iteration child sessions).
 * Search priority:
 *   1. PreviewDeployment of the current work session (ready).
 *   2. PreviewDeployment of the same task (ready).
 *   3. PreviewDeployment with the same branchName (ready).
 *   4. PreviewDeployment with the same pullRequestNumber (ready).
 *   5. Most recent ready preview for the project.
 *
 * Avoids false positives: never uses failed/stopped previews, previews of a
 * different repository, or a dubious manual preview when a more exact coolify
 * preview is ready.
 */

import { prisma } from "@/lib/db";

export type PreviewSource =
  | "current_session"
  | "task"
  | "branch"
  | "pr"
  | "recent";

export interface ResolvedPreview {
  id: string;
  status: string;
  provider: string | null;
  previewUrl: string | null;
  domain: string | null;
  branchName: string | null;
  workSessionId: string | null;
  lastDeploymentStatus: string | null;
  error: string | null;
  envConfigured: boolean | null;
  source: PreviewSource;
  sourceWorkSessionId: string | null;
}

const READY = ["ready"];
const NOT_READY = ["failed", "stopped"];

type PreviewRow = {
  id: string;
  status: string;
  provider: string | null;
  previewUrl: string | null;
  domain: string | null;
  branchName: string | null;
  workSessionId: string | null;
  lastDeploymentStatus: string | null;
  error: string | null;
  metadata: unknown;
};

function toResolved(row: PreviewRow, source: PreviewSource): ResolvedPreview {
  return {
    id: row.id,
    status: row.status,
    provider: row.provider,
    previewUrl: row.previewUrl,
    domain: row.domain,
    branchName: row.branchName,
    workSessionId: row.workSessionId,
    lastDeploymentStatus: row.lastDeploymentStatus,
    error: row.error,
    envConfigured:
      typeof row.metadata === "object" &&
      row.metadata !== null &&
      (row.metadata as Record<string, unknown>).env != null,
    source,
    sourceWorkSessionId: row.workSessionId,
  };
}

export interface PreviewResolverInput {
  projectId: string;
  taskId: string | null;
  workSessionId: string | null;
  branchName: string | null;
  pullRequestNumber: number | null;
  repositoryFullName: string | null;
}

/**
 * Returns the best ready preview for a task, with its resolution source.
 * Returns null when there is no usable preview.
 */
export async function resolveReadyPreviewForTask(
  input: PreviewResolverInput
): Promise<ResolvedPreview | null> {
  const {
    projectId,
    taskId,
    workSessionId,
    branchName,
    pullRequestNumber,
    repositoryFullName,
  } = input;

  const common: Record<string, unknown> = {
    projectId,
    status: { in: READY },
  };

  async function find(
    where: Record<string, unknown>,
    source: PreviewSource
  ): Promise<ResolvedPreview | null> {
    const row = await prisma.previewDeployment.findFirst({
      where,
      orderBy: { createdAt: "desc" },
    });
    return row ? toResolved(row as PreviewRow, source) : null;
  }

  // 1. Current session preview (ready).
  if (workSessionId) {
    const r = await find(
      { ...common, workSessionId },
      "current_session"
    );
    if (r) return r;
  }

  // 2. Same task (ready).
  if (taskId) {
    const r = await find({ ...common, taskId }, "task");
    if (r) return r;
  }

  // 3. Same branchName (ready, same repo).
  if (branchName) {
    const r = await find(
      {
        ...common,
        branchName,
        ...(repositoryFullName ? { repositoryFullName } : {}),
      },
      "branch"
    );
    if (r) return r;
  }

  // 4. Same pullRequestNumber (ready, same repo).
  if (pullRequestNumber) {
    const r = await find(
      {
        ...common,
        pullRequestNumber,
        ...(repositoryFullName ? { repositoryFullName } : {}),
      },
      "pr"
    );
    if (r) return r;
  }

  // 5. Most recent ready preview for the project.
  const recent = await find(
    { projectId, status: { in: READY } },
    "recent"
  );
  return recent;
}

/**
 * Returns the current session's own preview (any status) so diagnostics can
 * report "found but not ready" when the resolver did not find a ready one.
 */
export async function findCurrentSessionPreview(
  workSessionId: string | null
): Promise<ResolvedPreview | null> {
  if (!workSessionId) return null;
  const row = await prisma.previewDeployment.findFirst({
    where: { workSessionId, status: { notIn: NOT_READY } },
    orderBy: { createdAt: "desc" },
  });
  return row
    ? toResolved(row as PreviewRow, "current_session")
    : null;
}
