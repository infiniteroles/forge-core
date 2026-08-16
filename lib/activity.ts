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
  "deploy.dev.requested",
  "deploy.pro.requested",
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
