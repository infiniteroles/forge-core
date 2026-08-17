import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export const ACTIVITY_TYPES = [
  "project.created",
  "project.updated",
  "project.archived",
  "instruction.created",
  "agent.run.created",
  "agent.run.completed",
  "agent.run.failed",
  "task.created",
  "task.updated",
  "task.completed",
  "task.cancelled",
  "backlog.created",
  "deploy.dev.requested",
  "deploy.pro.requested",
  "repository.checked",
  "repository.linked",
  "repository.check_failed",
  "github.issue.created",
  "github.issue.checked",
  "github.issue.create_failed",
  "github.issue.check_failed",
  "github.branch.created",
  "github.branch.checked",
  "github.branch.create_failed",
  "github.branch.check_failed",
  "github.plan_commit.created",
  "github.plan_commit.updated",
  "github.plan_commit.checked",
  "github.plan_commit.create_failed",
  "github.plan_commit.check_failed",
  "github.pr.created",
  "github.pr.checked",
  "github.pr.create_failed",
  "github.pr.check_failed",
  "builder.proposal.created",
  "builder.proposal.completed",
  "builder.proposal.failed",
  "builder.commit.created",
  "builder.commit.completed",
  "builder.commit.completed_with_warnings",
  "builder.commit.failed",
  "builder.commit.checked",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export async function logActivity(input: {
  projectId?: string | null;
  type: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.activityLog.create({
    data: {
      projectId: input.projectId ?? null,
      type: input.type,
      message: input.message,
      metadata: input.metadata ?? undefined,
    },
  });
}
