import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { runDevWorkSession } from "@/lib/work-sessions/orchestrator";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const idea = typeof body?.idea === "string" ? body.idea.trim() : "";

  if (!idea) {
    return NextResponse.json(
      { ok: false, error: "Idea is required" },
      { status: 400 }
    );
  }
  if (idea.length > 5000) {
    return NextResponse.json(
      { ok: false, error: "Idea is too long (max 5000 characters)" },
      { status: 400 }
    );
  }

  // Create an initial task from the idea.
  const task = await prisma.task.create({
    data: {
      projectId: id,
      title: idea.slice(0, 200),
      description: idea,
      type: "product",
      priority: "medium",
      status: "todo",
      sortOrder: 0,
    },
  });

  await logActivity({
    projectId: id,
    type: "task.created",
    message: `Task created from idea: ${task.title}`,
    metadata: { taskId: task.id, source: "idea" },
  });

  const workSession = await prisma.workSession.create({
    data: {
      projectId: id,
      taskId: task.id,
      mode: "dev",
      status: "queued",
      objective: idea,
    },
  });

  await logActivity({
    projectId: id,
    type: "work_session.started",
    message: `Work session started from idea: ${idea.slice(0, 120)}`,
    metadata: {
      workSessionId: workSession.id,
      taskId: task.id,
      status: "queued",
      mode: "dev",
    },
  });

  try {
    const updated = await runDevWorkSession(workSession.id);
    return NextResponse.json({ ok: true, workSession: updated, task });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown work session error";

    await prisma.workSession.update({
      where: { id: workSession.id },
      data: { status: "failed", error: message, finishedAt: new Date() },
    });

    await logActivity({
      projectId: id,
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
