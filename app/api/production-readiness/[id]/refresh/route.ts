import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { refreshProductionReadiness } from "@/lib/production-readiness/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Fase 3.8 — Refresh (re-evaluate) a production readiness review.
 * Preserves human decisions; if the review was approved and a critical blocker
 * appears it falls back to needs_changes. NEVER merges, NEVER deploys.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

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
    const updated = await refreshProductionReadiness(id);
    return NextResponse.json({ ok: true, review: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
}
