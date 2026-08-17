import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { updateTaskSchema } from "@/lib/task";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateTaskSchema.safeParse(body ?? {});

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const becomesDone = data.status === "done" && existing.status !== "done";
  const becomesCancelled =
    data.status === "cancelled" && existing.status !== "cancelled";

  const task = await prisma.task.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description,
      type: data.type,
      priority: data.priority,
      status: data.status,
      sortOrder: data.sortOrder,
      assignedAgent: data.assignedAgent,
      notes: data.notes,
      completedAt: becomesDone ? new Date() : undefined,
      cancelledAt: becomesCancelled ? new Date() : undefined,
    },
  });

  if (becomesDone) {
    await logActivity({
      projectId: task.projectId,
      type: "task.completed",
      message: "Task completed",
      metadata: { taskId: task.id, status: "done" },
    });
  } else if (becomesCancelled) {
    await logActivity({
      projectId: task.projectId,
      type: "task.cancelled",
      message: "Task cancelled",
      metadata: { taskId: task.id, status: "cancelled" },
    });
  } else {
    await logActivity({
      projectId: task.projectId,
      type: "task.updated",
      message: "Task updated",
      metadata: {
        taskId: task.id,
        type: task.type,
        priority: task.priority,
        status: task.status,
      },
    });
  }

  return NextResponse.json({ task });
}
