import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { prepareProductionReadiness } from "@/lib/production-readiness/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Fase 3.8 — Prepare production readiness.
 * Loads the session context, runs the evaluator and persists a
 * ProductionReadinessReview. NEVER merges, NEVER deploys, NEVER touches main.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const session = await prisma.workSession.findUnique({
    where: { id },
    select: { id: true, projectId: true, taskId: true, objective: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Work session not found" }, { status: 404 });
  }
  if (!session.taskId) {
    return NextResponse.json(
      { error: "Work session has no linked task" },
      { status: 409 }
    );
  }

  await logActivity({
    projectId: session.projectId,
    type: "production.prepare_requested",
    message: `Preparación de producción solicitada para "${session.objective.slice(0, 80)}"`,
    metadata: {
      workSessionId: session.id,
      taskId: session.taskId,
      status: "requested",
    },
  });

  try {
    const review = await prepareProductionReadiness(session.id);
    return NextResponse.json({ ok: true, review });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
}
