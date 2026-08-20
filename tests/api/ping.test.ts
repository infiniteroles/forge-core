import { describe, expect, it } from "vitest";
// Relative import: the "@/" alias is not resolved by Vitest without a plugin.
import { GET } from "../../app/api/ping/route";

/**
 * Minimal test for the public GET /api/ping endpoint (Fase 3.8C).
 * Verifies the endpoint contract: { ok: true, service: "forge-core" }.
 */
describe("GET /api/ping", () => {
  it("returns ok and service", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.service).toBe("forge-core");
  });
});
