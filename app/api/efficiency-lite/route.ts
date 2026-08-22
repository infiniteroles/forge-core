import { NextResponse } from "next/server";

/**
 * Public GET /api/efficiency-lite — Fase 4.5 micro-feature.
 *
 * Validates the efficient-mode plumbing is deployed and serving. Returns a
 * static payload (no DB, no LLM) so it can never fail because of infra.
 */
export function GET() {
  return NextResponse.json({ efficiency: "lite" });
}
