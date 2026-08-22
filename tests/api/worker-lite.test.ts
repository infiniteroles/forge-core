import { describe, expect, it } from "vitest";
// Relative import: the "@/" alias is not resolved by Vitest without a plugin.
import { GET } from "../../app/api/worker-lite/route";

/**
 * Minimal test for the public GET /api/worker-lite endpoint (Fase 4.3).
 * Verifies the endpoint contract: { worker: "lite" }.
 */
describe("GET /api/worker-lite", () => {
  it("returns status 200 and worker lite", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.worker).toBe("lite");
  });
});
