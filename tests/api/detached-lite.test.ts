import { describe, expect, it } from "vitest";
// Relative import: the "@/" alias is not resolved by Vitest without a plugin.
import { GET } from "../../app/api/detached-lite/route";

/**
 * Minimal test for the public GET /api/detached-lite endpoint (Fase 4.3B).
 * Verifies the endpoint contract: { detached: "lite" }.
 */
describe("GET /api/detached-lite", () => {
  it("returns status 200 and detached lite", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.detached).toBe("lite");
  });
});
