import { describe, expect, it } from "vitest";
// Relative import: the "@/" alias is not resolved by Vitest without a plugin.
import { GET } from "../../app/api/version-lite/route";

/**
 * Minimal test for the public GET /api/version-lite endpoint (Fase 4.1).
 * Verifies the endpoint contract: { version: "lite" }.
 */
describe("GET /api/version-lite", () => {
  it("returns status 200 and version lite", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.version).toBe("lite");
  });
});
