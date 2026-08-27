import { describe, expect, it } from "vitest";
import { buildComposerHandoffFiles } from "../../lib/composer/handoff";

/**
 * Fase 6.6 — Handoff a IDE: the Composer generates README.md, AGENTS.md and
 * .github/copilot-instructions.md for the new repo so the user can clone and
 * continue with GitHub Copilot.
 */
describe("composer handoff files", () => {
  const spec = {
    name: "PadelHub",
    purpose: "Reservar pistas de pádel",
    auth: "multi_user",
    uiLibrary: "shadcn",
    palette: ["#ff6b57", "#0b0b0f"],
  };
  const proposal = {
    summary: "App Next.js con reservas",
    stack: {
      frontend: "Next.js",
      backend: "Next.js API routes",
      database: "PostgreSQL",
      auth: "Auth.js",
      hosting: "Coolify",
    },
  };
  const plan = {
    summary: "MVP en 3 fases",
    phases: ["setup", "datos", "UI"],
    tasks: [{ title: "t", description: "d", kind: "backend" }],
    testStrategy: "vitest",
    risks: ["tiempo"],
  };

  it("produces the three handoff files", () => {
    const files = buildComposerHandoffFiles(spec, proposal, plan);
    expect(files.map((f) => f.path)).toEqual([
      "README.md",
      "AGENTS.md",
      ".github/copilot-instructions.md",
    ]);
  });

  it("README includes name, purpose and stack", () => {
    const [readme] = buildComposerHandoffFiles(spec, proposal, plan);
    expect(readme.content).toContain("# PadelHub");
    expect(readme.content).toContain("Reservar pistas de pádel");
    expect(readme.content).toContain("Next.js");
    expect(readme.content).toContain("PostgreSQL");
  });

  it("AGENTS.md mentions the UI catalog and guardrails", () => {
    const agents = buildComposerHandoffFiles(spec, proposal, plan)[1];
    expect(agents.content).toContain("shadcn/ui");
    expect(agents.content.toLowerCase()).toContain("nunca");
    expect(agents.content).toContain("npm test");
  });

  it("copilot-instructions.md says to reply in Spanish", () => {
    const copilot =
      buildComposerHandoffFiles(spec, proposal, plan)[2];
    expect(copilot.content.toLowerCase()).toContain("español");
    expect(copilot.content).toContain("shadcn/ui");
  });

  it("handles a null plan gracefully", () => {
    const files = buildComposerHandoffFiles(spec, proposal, null);
    expect(files.length).toBe(3);
    expect(files[0].content).toContain("Sin plan registrado");
  });

  it("uses Material 3 when the spec asks for it", () => {
    const files = buildComposerHandoffFiles(
      { ...spec, uiLibrary: "material3" },
      proposal,
      plan
    );
    expect(files[1].content).toContain("Material 3");
  });
});
