import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { enqueueProductionPromotionExecution } from "@/lib/production-promotion/job";

export const runtime = "nodejs";

/**
 * POST /api/production-promotions/[id]/execute
 *
 * Fase 4.0 — async execution. Requires body `{ confirm: "PROMOTE" }`.
 * Validates the session + confirmation, runs a quick readiness gate, creates
 * a JobRun (type=production_promotion), links it to the promotion, marks the
 * promotion "promoting" and starts the background pipeline (preflight -> merge
 * -> deploy_wait -> verify -> complete).
 *
 * Returns IMMEDIATELY with:
 *   { "ok": true, "promotionId": "...", "jobRunId": "...", "status": "queued" }
 * It does NOT wait for the merge/deploy/verify inside the HTTP request.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = await _req.json().catch(() => ({}));
  const confirm = typeof body.confirm === "string" ? body.confirm : "";
  const humanEmail = process.env.ADMIN_EMAIL ?? "admin";

  if (confirm !== "PROMOTE") {
    return NextResponse.json(
      { error: 'Se requiere la confirmación explícita "PROMOTE" para ejecutar la promoción.' },
      { status: 400 }
    );
  }

  try {
    const enqueued = await enqueueProductionPromotionExecution({
      promotionId: id,
      humanEmail,
      confirm,
    });
    return NextResponse.json(enqueued);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error ejecutando la promoción";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
