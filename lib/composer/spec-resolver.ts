// Fase 6.24 — Resolve el spec del Composer para una tarea/proyecto y lo expone
// a los stages del build (scaffold, builder, QA). Cierra el gap spec→build:
// antes la spec (paleta, auth, logo, uiLibrary) se quedaba en el Composer y el
// builder generaba código sin conocerla.

import { prisma } from "@/lib/db";
import type { ComposerSpec } from "./types";

/** Última ComposerSession con spec para un proyecto (o null). */
export async function getComposerSpecForProject(
  projectId: string
): Promise<ComposerSpec | null> {
  const session = await prisma.composerSession.findFirst({
    where: { projectId, spec: { not: null as any } },
    orderBy: { updatedAt: "desc" },
    select: { spec: true },
  });
  if (!session?.spec || typeof session.spec !== "object") return null;
  return session.spec as ComposerSpec;
}

/** Spec del Composer para una tarea (resuelve por projectId de la tarea). */
export async function getComposerSpecForTask(
  taskId: string
): Promise<ComposerSpec | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  });
  if (!task) return null;
  return getComposerSpecForProject(task.projectId);
}

/** Paleta priorizada: spec.palette (extraída del logo) > dominantColors. */
export function specPalette(spec: ComposerSpec | null): string[] {
  const p = spec?.palette?.filter(Boolean) ?? [];
  if (p.length > 0) return p;
  return spec?.logoStyle?.dominantColors?.filter(Boolean) ?? [];
}

function isDarkHex(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // Luminancia relativa aproximada (rec.709)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

/** Color de acento/brand (primer color de la paleta del logo). */
export function specAccent(spec: ComposerSpec | null): string | undefined {
  return specPalette(spec)[0] || undefined;
}

/** Color de fondo: el más oscuro de la paleta (o el 2º) para que el texto clave
 *  lea bien; si no hay ninguno oscuro, undefined (el scaffold usa su default). */
export function specBackground(spec: ComposerSpec | null): string | undefined {
  const palette = specPalette(spec);
  if (palette.length === 0) return undefined;
  const dark = palette.find(isDarkHex);
  return dark ?? (palette.length > 1 ? palette[1] : undefined);
}

/** ¿La spec pide autenticación de usuarios? */
export function specRequiresAuth(spec: ComposerSpec | null): boolean {
  const auth = (spec?.auth ?? "").toLowerCase();
  return auth === "single_user" || auth === "multi_user";
}

/** Bloque de texto compacto para inyectar en los prompts del builder. */
export function formatSpecForBuilder(spec: ComposerSpec | null): string {
  if (!spec) return "";
  const lines: string[] = [];
  lines.push("## Especificación del producto (DEBES cumplirla)");
  lines.push(`Nombre: ${spec.name || "—"}`);
  lines.push(`Propósito: ${spec.purpose || "—"}`);
  if (spec.audience) lines.push(`Audiencia: ${spec.audience}`);
  if (spec.auth) lines.push(`Autenticación: ${spec.auth}${spec.authProvider ? ` (${spec.authProvider})` : ""}`);
  if (spec.uiLibrary) lines.push(`Librería UI: ${spec.uiLibrary}`);
  const palette = specPalette(spec);
  if (palette.length > 0)
    lines.push(`Paleta (del logo, ÚSALA): ${palette.join(", ")}`);
  if (spec.logoStyle?.hasLogo)
    lines.push(
      `El usuario subió un logo; usa sus colores dominantes (${(spec.logoStyle.dominantColors ?? []).join(", ") || "—"}).`
    );
  lines.push(
    "Reglas: no inventes features que no estén en la spec; respeta la paleta y la autenticación indicadas."
  );
  return lines.join("\n");
}
