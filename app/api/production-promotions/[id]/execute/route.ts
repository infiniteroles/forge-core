import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { executeProductionPromotion } from "@/lib/production-promotion/service";

export const runtime = "nodejs";

/**
 * POST /api/production-promotions/[id]/execute
 *
 * Executes a promotion. Requires body `{ confirm: "PROMOTE" }`.
 * Re-runs the preflight, merges the PR into main via GitHub, waits for the
 * production deploy and verifies /api/health + expected endpoint.
 * There is NO automatic rollback.
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
    const promotion = await executeProductionPromotion({
      promotionId: id,
      humanEmail,
      confirm,
    });
    return NextResponse.json({ promotion });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error ejecutando la promoción";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
