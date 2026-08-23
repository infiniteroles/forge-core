import { describe, expect, it } from "vitest";
// Relative import: the "@/" alias is not resolved by Vitest without a plugin.
import { GET } from "../../app/api/mvp-lite/route";

/**
 * Minimal test for the public GET /api/mvp-lite endpoint (Fase 5.0).
 * Verifies the endpoint contract: { mvp: "lite" }.
 */
describe("GET /api/mvp-lite", () => {
  it("returns status 200 and mvp lite", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mvp).toBe("lite");
  });
});
