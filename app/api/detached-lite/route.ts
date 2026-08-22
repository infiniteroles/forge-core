import { NextResponse } from "next/server";

/**
 * Public GET /api/detached-lite — Fase 4.3B micro-feature.
 *
 * Single-purpose liveness/contract endpoint used to validate that the
 * detached forge-worker service is deployed and serving alongside the web.
 * It deliberately avoids any DB or worker-state coupling so it can never
 * fail because of infrastructure: a 200 with { detached: "lite" } proves the
 * container is up and the request reached this code.
 */
export function GET() {
  return NextResponse.json({ detached: "lite" });
}
