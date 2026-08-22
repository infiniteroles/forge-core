import { describe, expect, it } from "vitest";
// Relative import: the "@/" alias is not resolved by Vitest without a plugin.
import { GET } from "../../app/api/efficiency-lite/route";

/**
 * Minimal test for the public GET /api/efficiency-lite endpoint (Fase 4.5).
 * Verifies the endpoint contract: { efficiency: "lite" }.
 */
describe("GET /api/efficiency-lite", () => {
  it("returns status 200 and efficiency lite", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.efficiency).toBe("lite");
  });
});
