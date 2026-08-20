import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prepareProductionPromotion } from "@/lib/production-promotion/service";

export const runtime = "nodejs";

/**
 * POST /api/production-readiness/[id]/promotion/prepare
 *
 * Runs the promotion preflight for an approved readiness review and creates a
 * ProductionPromotion in `ready_to_promote` (or `preflight_failed`).
 * It NEVER merges — this endpoint only prepares.
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
  const workSessionId =
    typeof body.workSessionId === "string" ? body.workSessionId : null;
  const humanEmail = process.env.ADMIN_EMAIL ?? "admin";

  try {
    const promotion = await prepareProductionPromotion({
      reviewId: id,
      workSessionId,
      humanEmail,
    });
    if (!promotion) {
      return NextResponse.json(
        { error: "No se pudo preparar la promoción" },
        { status: 404 }
      );
    }
    return NextResponse.json({ promotion });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error preparando la promoción";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
