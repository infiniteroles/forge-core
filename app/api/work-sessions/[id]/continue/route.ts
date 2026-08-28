import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { runIterationWorkSession } from "@/lib/work-sessions/orchestrator";

export const dynamic = "force-dynamic";

const DEFAULT_CONTINUE_INSTRUCTION =
  "Continue from the current state of this task and apply the next safe, useful development step. Keep changes small and scoped.";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const previous = await prisma.workSession.findUnique({
    where: { id },
    include: { task: true },
  });
  if (!previous) {
    return NextResponse.json({ error: "Work session not found" }, { status: 404 });
  }
  if (!previous.taskId || !previous.task) {
    return NextResponse.json(
      { error: "Work session has no linked task" },
      { status: 409 }
    );
  }
  // Capture before closures: TS does not keep property narrowing inside .catch().
  const taskTitle = previous.task.title;

  const body = await request.json().catch(() => null);
  const rawInstruction =
    typeof body?.instruction === "string" ? body.instruction.trim() : "";
  const instruction = rawInstruction || DEFAULT_CONTINUE_INSTRUCTION;

  if (instruction.length > 5000) {
    return NextResponse.json(
      { ok: false, error: "Instruction is too long (max 5000 characters)" },
      { status: 400 }
    );
  }

  // Create a NEW session linked to the previous one — never overwrite it.
  const iterationNumber = (previous.iterationNumber ?? 1) + 1;
  const workSession = await prisma.workSession.create({
    data: {
      projectId: previous.projectId,
      taskId: previous.taskId,
      mode: "iteration",
      status: "queued",
      objective: rawInstruction || "Continue work session",
      requestedChanges: rawInstruction || null,
      parentWorkSessionId: previous.id,
      iterationNumber,
    },
  });

  await logActivity({
    projectId: previous.projectId,
    type: "work_session.continued",
    message: `Work session continued (iteration #${iterationNumber}) for task "${taskTitle}"`,
    metadata: {
      workSessionId: workSession.id,
      parentWorkSessionId: previous.id,
      taskId: previous.taskId,
      iterationNumber,
      status: "queued",
      mode: "iteration",
      instruction: instruction.slice(0, 200),
    },
  });

  // Run without await — avoids HTTP timeout on long sessions; client polls for status.
  void runIterationWorkSession(workSession.id).catch(async (error) => {
    const message =
      error instanceof Error ? error.message : "Unknown continuation error";
    await prisma.workSession
      .update({ where: { id: workSession.id }, data: { status: "failed", error: message, finishedAt: new Date() } })
      .catch(() => undefined);
    await logActivity({
      projectId: previous.projectId,
      type: "work_session.iteration_failed",
      message: `Iteration failed for task "${taskTitle}": ${message}`,
      metadata: { workSessionId: workSession.id, parentWorkSessionId: previous.id, taskId: previous.taskId, iterationNumber, status: "failed" },
    }).catch(() => undefined);
  });
  return NextResponse.json({ ok: true, workSession });
}
