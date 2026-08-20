import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { runIterationWorkSession } from "@/lib/work-sessions/orchestrator";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
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

  const body = await request.json().catch(() => null);
  const instruction =
    typeof body?.instruction === "string" ? body.instruction.trim() : "";

  if (!instruction) {
    return NextResponse.json(
      { ok: false, error: "Instruction is required" },
      { status: 400 }
    );
  }
  if (instruction.length > 5000) {
    return NextResponse.json(
      { ok: false, error: "Instruction is too long (max 5000 characters)" },
      { status: 400 }
    );
  }

  // Link to the latest work session of this task (if any) to keep the
  // iteration history chain.
  const lastSession = await prisma.workSession.findFirst({
    where: { taskId: task.id },
    orderBy: { createdAt: "desc" },
  });

  const iterationNumber = (lastSession?.iterationNumber ?? 0) + 1;

  const workSession = await prisma.workSession.create({
    data: {
      projectId: task.projectId,
      taskId: task.id,
      mode: "iteration",
      status: "queued",
      objective: instruction,
      requestedChanges: instruction,
      parentWorkSessionId: lastSession?.id ?? null,
      iterationNumber,
    },
  });

  await logActivity({
    projectId: task.projectId,
    type: "work_session.iteration_started",
    message: `Iteration started for task "${task.title}"`,
    metadata: {
      workSessionId: workSession.id,
      parentWorkSessionId: lastSession?.id ?? null,
      taskId: task.id,
      iterationNumber,
      status: "queued",
      mode: "iteration",
      instruction: instruction.slice(0, 200),
    },
  });

  try {
    const updated = await runIterationWorkSession(workSession.id);
    return NextResponse.json({ ok: true, workSession: updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown iteration error";

    await prisma.workSession.update({
      where: { id: workSession.id },
      data: { status: "failed", error: message, finishedAt: new Date() },
    });

    await logActivity({
      projectId: task.projectId,
      type: "work_session.iteration_failed",
      message: `Iteration failed for task "${task.title}": ${message}`,
      metadata: {
        workSessionId: workSession.id,
        parentWorkSessionId: lastSession?.id ?? null,
        taskId: task.id,
        iterationNumber,
        status: "failed",
      },
    });

    return NextResponse.json(
      { ok: false, error: `Iteration failed: ${message}` },
      { status: 502 }
    );
  }
}
