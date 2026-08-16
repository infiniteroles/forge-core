import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { runPlannerAgent } from "@/lib/llm/planner";
import { LLMError } from "@/lib/llm/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const run = await prisma.agentRun.create({
    data: {
      projectId: id,
      agentName: "planner",
      status: "running",
      startedAt: new Date(),
    },
  });

  await logActivity({
    projectId: id,
    type: "agent.run.created",
    message: "Planner run started",
    metadata: { agentName: "planner", agentRunId: run.id },
  });

  try {
    const result = await runPlannerAgent(id);

    const output =
      result.status === "completed"
        ? JSON.stringify(result.output)
        : result.raw;

    const updated = await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: result.status,
        output,
        model: result.model,
        finishedAt: new Date(),
      },
    });

    await logActivity({
      projectId: id,
      type: "agent.run.completed",
      message:
        result.status === "completed"
          ? "Planner run completed"
          : "Planner run completed with warnings",
      metadata: {
        agentName: "planner",
        model: result.model,
        agentRunId: run.id,
      },
    });

    return NextResponse.json({ ok: true, agentRun: updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error while running the planner";
    const code = error instanceof LLMError ? error.code : undefined;

    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        output: message,
        finishedAt: new Date(),
      },
    });

    await logActivity({
      projectId: id,
      type: "agent.run.failed",
      message: "Planner run failed",
      metadata: { agentName: "planner", agentRunId: run.id },
    });

    if (code === "not_configured") {
      return NextResponse.json(
        { ok: false, error: "LLM provider is not configured" },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
