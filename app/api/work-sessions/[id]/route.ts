import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const ws = await prisma.workSession.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      mode: true,
      currentStage: true,
      objective: true,
      summary: true,
      error: true,
      iterationNumber: true,
      startedAt: true,
      finishedAt: true,
      projectId: true,
      taskId: true,
    },
  });
  if (!ws) {
    return NextResponse.json({ error: "Work session not found" }, { status: 404 });
  }

  return NextResponse.json(ws);
}
