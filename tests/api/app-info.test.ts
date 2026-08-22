import { describe, expect, it } from "vitest";
// Relative import: the "@/" alias is not resolved by Vitest without a plugin.
import { GET } from "../../app/api/app-info/route";

/**
 * Test for the public GET /api/app-info endpoint (task: Add GET /api/app-info).
 * Verifies the endpoint contract: static public app metadata, no secrets.
 */
describe("GET /api/app-info", () => {
  it("returns status 200 and public app metadata", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.name).toBe("Forge Core01");
    expect(body.service).toBe("forge-core");
    expect(body.environment).toBe("DEV");
    expect(body.version).toBe("0.1.0");
  });
});
