import { NextResponse } from "next/server";

/**
 * Public GET /api/mvp-lite — Fase 5.0 micro-feature.
 *
 * Validates the MVP functional flow plumbing is deployed and serving. Returns a
 * static payload (no DB, no LLM) so it can never fail because of infra.
 */
export function GET() {
  return NextResponse.json({ mvp: "lite" });
}
