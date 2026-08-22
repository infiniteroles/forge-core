import { describe, expect, it } from "vitest";
// Relative import: the "@/" alias is not resolved by Vitest without a plugin.
import { GET } from "../../app/api/job-lite/route";

/**
 * Minimal test for the public GET /api/job-lite endpoint (Fase 4.2B).
 * Verifies the endpoint contract: { job: "lite" }.
 */
describe("GET /api/job-lite", () => {
  it("returns status 200 and job lite", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.job).toBe("lite");
  });
});
