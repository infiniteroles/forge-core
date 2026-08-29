import { describe, expect, it } from "vitest";
import { buildNextJsScaffold } from "../../lib/scaffold/nextjs";

/**
 * Fase 6.4c — Scaffold real del MVP: the Composer generates a functional
 * Next.js + Tailwind app (with Dockerfile) so the PR/preview show a real app.
 */
describe("nextjs scaffold", () => {
  const files = buildNextJsScaffold({
    name: "TengoYBusco",
    purpose: "Intercambiar libros y cómics.",
    accent: "#ff6b57",
    background: "#0b0b0f",
  });

  it("produces a complete functional app", () => {
    const paths = files.map((f) => f.path);
    expect(paths).toContain("package.json");
    expect(paths).toContain("tsconfig.json");
    expect(paths).toContain("next.config.mjs");
    expect(paths).toContain("tailwind.config.ts");
    expect(paths).toContain("app/layout.tsx");
    expect(paths).toContain("app/page.tsx");
    expect(paths).toContain("app/globals.css");
    expect(paths).toContain("Dockerfile");
    expect(paths).toContain(".gitignore");
  });

  it("package.json is valid and has next/react/tailwind", () => {
    const pkg = JSON.parse(files.find((f) => f.path === "package.json")!.content);
    expect(pkg.dependencies.next).toBeDefined();
    expect(pkg.dependencies.react).toBeDefined();
    expect(pkg.devDependencies.tailwindcss).toBeDefined();
    expect(pkg.scripts.build).toBe("next build");
    expect(pkg.scripts.start).toBe("next start");
  });

  it("page.tsx includes the brand name, purpose and accent", () => {
    const page = files.find((f) => f.path === "app/page.tsx")!.content;
    expect(page).toContain("TengoYBusco");
    expect(page).toContain("Intercambiar libros y c&#243;mics.");
    expect(page).toContain("#ff6b57");
  });

  it("Dockerfile exposes port 3000 and starts the app", () => {
    const docker = files.find((f) => f.path === "Dockerfile")!.content;
    expect(docker).toContain("EXPOSE 3000");
    expect(docker).toContain("npm run build");
    expect(docker).toContain('"npm", "run", "start"');
  });

  it("handles JSX-unsafe text safely", () => {
    const unsafe = buildNextJsScaffold({
      name: "App {con} llaves",
      purpose: 'B <hola> "quotes" & más {x}',
    });
    const page = unsafe.find((f) => f.path === "app/page.tsx")!.content;
    expect(page).toContain("&#123;con&#125;");
    expect(page).not.toContain("<hola>");
    expect(page).toContain("&lt;hola&gt;");
  });
});
