import { describe, expect, it } from "vitest";
import { specLooksComplete } from "../../lib/composer/discovery";

/**
 * Fase 6.0 — Composer discovery: the spec is only accepted once the essential
 * fields (name, purpose, auth, uiLibrary) are decided.
 */
describe("composer discovery spec completeness", () => {
  it("accepts a fully decided spec", () => {
    expect(
      specLooksComplete({
        name: "Peluquería",
        purpose: "Gestionar reservas",
        auth: "multi_user",
        uiLibrary: "shadcn",
      })
    ).toBe(true);
  });

  it("rejects when essential fields are missing", () => {
    expect(specLooksComplete({ name: "Peluquería", purpose: "Reservas" })).toBe(
      false
    );
    expect(specLooksComplete(null)).toBe(false);
    expect(specLooksComplete(undefined)).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(
      specLooksComplete({
        name: "  ",
        purpose: "Reservas",
        auth: "none",
        uiLibrary: "material3",
      })
    ).toBe(false);
  });
});
