import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { refreshProductionPromotion } from "@/lib/production-promotion/service";

export const runtime = "nodejs";

/**
 * POST /api/production-promotions/[id]/refresh
 *
 * Re-reads the live PR merge state and probes production health + expected
 * endpoint to bring the promotion up to date. NEVER re-merges, NEVER rolls
 * back automatically.
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

  try {
    const promotion = await refreshProductionPromotion(id);
    return NextResponse.json({ promotion });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error actualizando la promoción";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
