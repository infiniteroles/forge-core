import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { runSessionChecks } from "@/lib/work-sessions/checks";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const session = await prisma.workSession.findUnique({ where: { id } });
  if (!session) {
    return NextResponse.json({ error: "Work session not found" }, { status: 404 });
  }

  try {
    const summary = await runSessionChecks(session.id);
    const checks = await prisma.sessionCheck.findMany({
      where: { workSessionId: session.id },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ ok: true, summary, checks });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown session checks error";
    return NextResponse.json(
      { ok: false, error: `Session checks failed: ${message}` },
      { status: 502 }
    );
  }
}
