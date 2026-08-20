import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { approveProductionReadiness } from "@/lib/production-readiness/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Fase 3.8 — Approve a production readiness review (human only).
 * Only allowed when the recommendation is ready_for_production.
 * NEVER merges, NEVER deploys, NEVER touches main.
 */
export async function POST(request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { notes?: string };
  const humanEmail = process.env.ADMIN_EMAIL ?? "admin";

  const review = await prisma.productionReadinessReview.findUnique({
    where: { id },
  });
  if (!review) {
    return NextResponse.json(
      { error: "Production readiness review not found" },
      { status: 404 }
    );
  }

  try {
    const updated = await approveProductionReadiness(id, humanEmail, body.notes);
    return NextResponse.json({ ok: true, review: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
}
