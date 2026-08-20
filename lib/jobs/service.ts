/**
 * Async jobs — persistence service (Fase 4.0).
 *
 * Thin, generic CRUD over the JobRun table plus the safe serialization used by
 * the API and the UI. No secrets are ever persisted here beyond what callers
 * explicitly put in `metadata` — and the promotion flow never does.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { JobRunPublicData } from "./types";

function jsonField(v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (v === null || v === undefined) return Prisma.DbNull;
  return v as Prisma.InputJsonValue;
}

export type JobRunRow = {
  id: string;
  type: string;
  status: string;
  resourceType: string | null;
  resourceId: string | null;
  projectId: string | null;
  taskId: string | null;
  workSessionId: string | null;
  currentStage: string | null;
  progressPercent: number | null;
  summary: string | null;
  error: string | null;
  result: unknown;
  metadata: unknown;
  lockedAt: Date | null;
  lockedBy: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
  lastHeartbeatAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface CreateJobRunInput {
  type: string;
  resourceType?: string | null;
  resourceId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  workSessionId?: string | null;
  input?: unknown;
  metadata?: unknown;
}

export function createJobRun(input: CreateJobRunInput) {
  return prisma.jobRun.create({
    data: {
      type: input.type,
      status: "queued",
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null,
      workSessionId: input.workSessionId ?? null,
      currentStage: null,
      progressPercent: 0,
      input: jsonField(input.input),
      metadata: jsonField(input.metadata),
    },
  });
}

export function startJobRun(jobRunId: string, opts?: { lockedBy?: string }) {
  return prisma.jobRun.update({
    where: { id: jobRunId },
    data: {
      status: "running",
      startedAt: new Date(),
      lockedAt: new Date(),
      lockedBy: opts?.lockedBy ?? "inline",
      lastHeartbeatAt: new Date(),
    },
  });
}

export function updateJobStage(
  jobRunId: string,
  stage: string,
  opts?: {
    progressPercent?: number;
    summary?: string;
    metadata?: unknown;
    status?: string;
  }
) {
  return prisma.jobRun.update({
    where: { id: jobRunId },
    data: {
      currentStage: stage,
      progressPercent: opts?.progressPercent,
      summary: opts?.summary,
      status: opts?.status,
      metadata: opts?.metadata !== undefined ? jsonField(opts.metadata) : undefined,
      lastHeartbeatAt: new Date(),
    },
  });
}

export function touchJobHeartbeat(jobRunId: string) {
  return prisma.jobRun.update({
    where: { id: jobRunId },
    data: { lastHeartbeatAt: new Date() },
  });
}

export function completeJobRun(
  jobRunId: string,
  result?: unknown,
  opts?: { stage?: string; summary?: string }
) {
  return prisma.jobRun.update({
    where: { id: jobRunId },
    data: {
      status: "completed",
      currentStage: opts?.stage ?? "complete",
      progressPercent: 100,
      summary: opts?.summary,
      result: jsonField(result ?? {}),
      finishedAt: new Date(),
      error: null,
      lastHeartbeatAt: new Date(),
    },
  });
}

export function failJobRun(
  jobRunId: string,
  error: string,
  opts?: { stage?: string; metadata?: unknown }
) {
  return prisma.jobRun.update({
    where: { id: jobRunId },
    data: {
      status: "failed",
      currentStage: opts?.stage,
      error,
      failedAt: new Date(),
      metadata: opts?.metadata !== undefined ? jsonField(opts.metadata) : undefined,
      lastHeartbeatAt: new Date(),
    },
  });
}

export function markJobStale(jobRunId: string, reason?: string) {
  return prisma.jobRun.update({
    where: { id: jobRunId },
    data: {
      status: "stale",
      error: reason ?? "El job no reportó actividad dentro de la ventana esperada.",
      lastHeartbeatAt: new Date(),
    },
  });
}

export function markJobRecovered(jobRunId: string) {
  return prisma.jobRun.update({
    where: { id: jobRunId },
    data: {
      status: "recovered",
      error: null,
      lastHeartbeatAt: new Date(),
    },
  });
}

export function getJobRun(jobRunId: string) {
  return prisma.jobRun.findUnique({ where: { id: jobRunId } });
}

export function getJobRunByResource(
  resourceType: string,
  resourceId: string
) {
  return prisma.jobRun.findFirst({
    where: { resourceType, resourceId },
    orderBy: { createdAt: "desc" },
  });
}

/** Serializes a JobRun row into the safe public shape for API/UI responses. */
export function toJobRunPublicData(job: JobRunRow): JobRunPublicData {
  const result = job.result as Record<string, unknown> | null;
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    resourceType: job.resourceType,
    resourceId: job.resourceId,
    projectId: job.projectId,
    taskId: job.taskId,
    workSessionId: job.workSessionId,
    currentStage: job.currentStage,
    progressPercent: job.progressPercent,
    summary: job.summary,
    error: job.error,
    result: result && typeof result === "object" ? result : null,
    startedAt: job.startedAt ? job.startedAt.toISOString() : null,
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
    failedAt: job.failedAt ? job.failedAt.toISOString() : null,
    cancelledAt: job.cancelledAt ? job.cancelledAt.toISOString() : null,
    lastHeartbeatAt: job.lastHeartbeatAt
      ? job.lastHeartbeatAt.toISOString()
      : null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
