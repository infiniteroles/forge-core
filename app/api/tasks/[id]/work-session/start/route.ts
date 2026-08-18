import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { runDevWorkSession } from "@/lib/work-sessions/orchestrator";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    include: { project: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const workSession = await prisma.workSession.create({
    data: {
      projectId: task.projectId,
      taskId: task.id,
      mode: "dev",
      status: "queued",
      objective: task.title,
    },
  });

  await logActivity({
    projectId: task.projectId,
    type: "work_session.started",
    message: `Work session started for task "${task.title}"`,
    metadata: {
      workSessionId: workSession.id,
      taskId: task.id,
      status: "queued",
      mode: "dev",
    },
  });

  try {
    const updated = await runDevWorkSession(workSession.id);
    return NextResponse.json({ ok: true, workSession: updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown work session error";

    await prisma.workSession.update({
      where: { id: workSession.id },
      data: { status: "failed", error: message, finishedAt: new Date() },
    });

    await logActivity({
      projectId: task.projectId,
      type: "work_session.failed",
      message: `Work session failed: ${message}`,
      metadata: { workSessionId: workSession.id, taskId: task.id, status: "failed" },
    });

    return NextResponse.json(
      { ok: false, error: `Work session failed: ${message}` },
      { status: 502 }
    );
  }
}
