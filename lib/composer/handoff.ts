// Fase 6.6 — Handoff a tu IDE. Genera y sube al repo creado por el Composer los
// archivos de arranque para GitHub Copilot / agentes de IA:
//   - README.md                      → qué es el proyecto y cómo arrancarlo
//   - AGENTS.md                      → instrucciones para agentes que trabajen en el repo
//   - .github/copilot-instructions.md→ instrucciones específicas de GitHub Copilot
//
// La generación del contenido es PURA (testeable sin red). La subida se hace a
// la rama por defecto (main) del repo NUEVO, justo antes de que el builder cree
// su rama, para que la rama de build también herede estos ficheros.

import { createOrUpdateFiles } from "@/lib/github/files";
import type { ComposerPlan, ComposerProposal, ComposerSpec } from "./types";

export interface ComposerHandoffFile {
  path: string;
  content: string;
}

function stackTable(spec: ComposerSpec, proposal: ComposerProposal): string {
  const s = proposal.stack;
  const ui = spec.uiLibrary === "material3" ? "Material 3" : "shadcn/ui";
  return [
    `| Capa | Tecnología |`,
    `| --- | --- |`,
    `| Frontend | ${s.frontend || "Next.js"} (${ui}) |`,
    `| Backend | ${s.backend || s.frontend || "Next.js API routes"} |`,
    `| Base de datos | ${s.database || "PostgreSQL"} |`,
    `| Autenticación | ${s.auth || spec.auth || "—"} |`,
    `| Hosting | ${s.hosting || "—"} |`,
  ].join("\n");
}

function runCommands(proposal: ComposerProposal): string {
  const frontend = (proposal.stack.frontend || "").toLowerCase();
  if (frontend.includes("next")) {
    return [
      "```bash",
      "npm install",
      "npm run dev     # entorno de desarrollo (Next.js)",
      "npm run build   # build de producción",
      "npm test        # tests (vitest)",
      "```",
    ].join("\n");
  }
  return [
    "```bash",
    "npm install",
    "npm run dev     # entorno de desarrollo",
    "npm run build   # build de producción",
    "npm test        # tests",
    "```",
  ].join("\n");
}

export function buildComposerHandoffFiles(
  spec: ComposerSpec,
  proposal: ComposerProposal,
  plan: ComposerPlan | null
): ComposerHandoffFile[] {
  const name = spec.name || "Proyecto Forge";
  const purpose = spec.purpose || "Aplicación construida con Forge Core01.";
  const ui = spec.uiLibrary === "material3" ? "Material 3" : "shadcn/ui";

  const readme = `# ${name}

${purpose}

> Proyecto generado y construido por **Forge Core01** (Chat Composer). Este repo
> está preparado para que continúes el desarrollo en tu IDE con **GitHub Copilot**
> (ver \`AGENTS.md\` y \`.github/copilot-instructions.md\`).

## Stack

${stackTable(spec, proposal)}

## Quickstart

${runCommands(proposal)}

Si el proyecto usa base de datos con Prisma, aplica las migraciones antes de
arrancar:

\`\`\`bash
npx prisma migrate deploy
\`\`\`

## Estructura sugerida

${(proposal.structure?.length ? proposal.structure : ["src/", "app/", "components/", "lib/"]).map((p) => `- \`${p}\``).join("\n")}

## Documentación para agentes

- \`AGENTS.md\` — instrucciones para agentes de IA / Copilot en este repo.
- \`.github/copilot-instructions.md\` — instrucciones específicas de GitHub Copilot.

## Plan de desarrollo

${plan ? `**Resumen**: ${plan.summary}

**Fases**: ${plan.phases.join(" · ")}
${plan.testStrategy ? `\n**Estrategia de pruebas**: ${plan.testStrategy}` : ""}
${plan.risks?.length ? `\n**Riesgos**: ${plan.risks.join("; ")}` : ""}` : "Sin plan registrado."}
`;

  const agents = `# AGENTS.md

Instrucciones para agentes de IA (GitHub Copilot, Copilot Workspace, etc.) que
trabajen en este repositorio.

## Qué es este proyecto

**${name}** — ${purpose}

- UI por defecto: **${ui}**${spec.palette?.length ? ` · paleta: ${spec.palette.join(", ")}` : ""}.
- Stack: ${Object.entries(proposal.stack).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ") || "ver README.md"}.
${spec.auth ? `- Usuarios: ${spec.auth === "none" ? "sin login" : spec.auth === "single_user" ? "un solo usuario" : "multi-usuario"}${spec.authProvider ? ` (${spec.authProvider})` : ""}.` : ""}

## Comandos

${runCommands(proposal)}

## Convenciones

1. **Tipos**: TypeScript estricto. Añade tipos a todo lo nuevo; no uses \`any\` sin justificación.
2. **UI**: usa el catálogo de componentes **${ui}**. No inventes patrones visuales propios si existe un componente del catálogo para el caso.
3. **Datos**: si hay base de datos, los cambios de esquema se hacen con migraciones de Prisma; nunca edites la BD a mano.
4. **Commits**: mensajes cortos y descriptivos en inglés (o español si el repo ya los usa), un solo cambio lógico por commit.
5. **Tests**: añade tests para funcionalidad nueva (vitest). \`npm test\` debe pasar.
6. **Estilo**: respeta el código existente; formatea antes de commitear.

## Guardrails

- **Nunca** escribas secretos, tokens o credenciales en código ni en commits.
- **No** subas ficheros de entorno (\`.env*\`) al repositorio.
- No introduzcas dependencias innecesarias; pregunta antes de añadir un paquete grande.
- Si un cambio rompe el build o los tests, no lo des por terminado: arréglalo o revierte.

## Cómo proponer cambios

Trabaja en una rama corta (\`feature/…\` o \`fix/…\`), commitea en pasos pequeños y
abre una Pull Request con descripción del cambio y resultado de \`npm test\`.
`;

  const copilot = `# Instrucciones de GitHub Copilot

Contexto y reglas para que GitHub Copilot asista eficazmente en este repositorio.

## Proyecto

**${name}** — ${purpose}

Stack principal: ${Object.entries(proposal.stack).filter(([, v]) => v).map(([, v]) => v).join(" · ") || "ver README.md"}.
UI: **${ui}**${spec.palette?.length ? ` (paleta: ${spec.palette.join(", ")})` : ""}.

## Al responder en este repo

1. **Idioma**: responde al usuario en español, salvo que indique lo contrario.
2. **Código**: TypeScript con tipos explícitos; sigue las convenciones de archivos existentes (App Router de Next.js si aplica).
3. **Componentes**: prefiere el catálogo **${ui}** antes de crear estilos propios.
4. **BD**: los cambios de esquema vía migraciones Prisma; no generes SQL a mano salvo migraciones.
5. **Comandos útiles**: \`npm run dev\`, \`npm run build\`, \`npm test\`, \`npx prisma migrate deploy\`.
6. **Seguridad**: nunca sugieras imprimir o commitear secretos; usa variables de entorno.
7. **Refactor**: cuando propongas cambios, comprueba usos y tipos (no rompas llamadas existentes).

## Flujo recomendado

- Para una tarea nueva: crea una rama, haz cambios pequeños, verifica \`npm test\` y abre PR.
- Si el usuario te pide "explica", responde conciso; si pide "implementa", entrega el código en el editor.
`;

  return [
    { path: "README.md", content: readme },
    { path: "AGENTS.md", content: agents },
    { path: ".github/copilot-instructions.md", content: copilot },
  ];
}

/**
 * Sube los ficheros de handoff a la rama por defecto del repo (una commit por
 * fichero, vía Contents API). Reintenta un par de veces por si la rama de
 * auto_init todavía no está lista tras crear el repo.
 */
export async function pushComposerHandoff(
  repositoryFullName: string,
  spec: ComposerSpec,
  proposal: ComposerProposal,
  plan: ComposerPlan | null,
  branchName = "main"
): Promise<{ pushed: string[] }> {
  const files = buildComposerHandoffFiles(spec, proposal, plan);
  const inputs = files.map((f) => ({
    repositoryFullName,
    branchName,
    path: f.path,
    message: `chore(handoff): add ${f.path} (Forge Composer)`,
    content: f.content,
  }));

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await createOrUpdateFiles(inputs);
      return { pushed: files.map((f) => f.path) };
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
  }
  throw lastError;
}
