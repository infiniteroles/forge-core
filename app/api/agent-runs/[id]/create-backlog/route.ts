import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { plannerOutputSchema } from "@/lib/llm/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parsePlannerOutput(output: string | null) {
  if (!output) return null;
  try {
    const parsed = plannerOutputSchema.safeParse(JSON.parse(output));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function POST(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const run = await prisma.agentRun.findUnique({ where: { id } });
  if (!run || !run.projectId) {
    return NextResponse.json({ error: "Agent run not found" }, { status: 404 });
  }

  if (run.status !== "completed" && run.status !== "completed_with_warnings") {
    return NextResponse.json(
      { ok: false, error: "Agent run is not completed" },
      { status: 400 }
    );
  }

  const plan = parsePlannerOutput(run.output);
  if (!plan || plan.proposed_tasks.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No proposed tasks found in this run" },
      { status: 400 }
    );
  }

  const existing = await prisma.task.findMany({
    where: { projectId: run.projectId, sourceAgentRunId: id },
    select: { title: true },
  });
  const existingTitles = new Set(existing.map((task) => task.title));

  let created = 0;
  let skipped = 0;

  for (const proposed of plan.proposed_tasks) {
    if (existingTitles.has(proposed.title)) {
      skipped++;
      continue;
    }

    await prisma.task.create({
      data: {
        projectId: run.projectId,
        sourceAgentRunId: id,
        title: proposed.title,
        description: proposed.description || null,
        type: proposed.type,
        priority: proposed.priority,
        status: "todo",
        sortOrder: created + 1,
      },
    });

    existingTitles.add(proposed.title);
    created++;
  }

  await logActivity({
    projectId: run.projectId,
    type: "backlog.created",
    message: "Backlog created from planner run",
    metadata: { agentRunId: id, created, skipped },
  });

  return NextResponse.json({ ok: true, created, skipped });
}
