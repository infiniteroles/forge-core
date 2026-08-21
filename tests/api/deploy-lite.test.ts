import { describe, expect, it } from "vitest";
// Relative import: the "@/" alias is not resolved by Vitest without a plugin.
import { GET } from "../../app/api/deploy-lite/route";

/**
 * Minimal test for the public GET /api/deploy-lite endpoint (Fase 4.2).
 * Verifies the endpoint contract: { deploy: "lite" }.
 */
describe("GET /api/deploy-lite", () => {
  it("returns status 200 and deploy lite", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.deploy).toBe("lite");
  });
});
