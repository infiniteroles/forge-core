import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rejectProductionReadiness } from "@/lib/production-readiness/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Fase 3.8 — Reject a production readiness review (human only).
 * Requires a `notes` field explaining the rejection.
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
    const updated = await rejectProductionReadiness(id, humanEmail, body.notes ?? "");
    return NextResponse.json({ ok: true, review: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
}
