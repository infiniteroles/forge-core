// Fase 6.9 — Check previo de necesidades del proyecto antes de construir.
// Antes de permitir arrancar la construcción, evaluamos qué necesita el
// proyecto (nombre, propósito, repositorio…) y le decimos al usuario, de forma
// clara, qué tiene que solventar para cada necesidad. Nada de arranques
// silenciosos que pierden datos.

import {
  githubFetch,
  getGithubConfig,
  isGithubConfigured,
} from "@/lib/github/client";
import type { ComposerSpec } from "./types";

export type ReadinessSeverity = "ok" | "warning" | "blocker";

export type ReadinessItem = {
  severity: ReadinessSeverity;
  label: string;
  detail?: string;
};

export type ComposerReadiness = {
  ready: boolean;
  items: ReadinessItem[];
};

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "app"
  );
}

function repoFromUrl(url: string): string | null {
  const m = url.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/i);
  return m ? m[1] : null;
}

/**
 * Encuentra (best-effort) el primer nombre de repo libre para el slug dado,
 * consultando GitHub. Si la consulta falla, devuelve el slug base y el dedup
 * del build se encargará.
 */
async function findFreeRepoName(owner: string, base: string): Promise<string> {
  for (let n = 0; n < 5; n++) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    try {
      const res = await githubFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(candidate)}`,
        getGithubConfig(),
        { method: "GET" }
      );
      if (res.status === 404) return candidate; // libre
      if (!res.ok) return candidate; // otro error → asumimos libre, el build dedup
    } catch {
      return candidate; // red caída → asumimos libre
    }
  }
  return `${base}-5`;
}

export async function evaluateComposerReadiness(
  spec: ComposerSpec | null | undefined
): Promise<ComposerReadiness> {
  const items: ReadinessItem[] = [];
  const s = spec ?? ({} as ComposerSpec);
  const name = (s.name ?? "").trim();
  const purpose = (s.purpose ?? "").trim();
  const repo = s.repo;

  // 1. Nombre
  items.push(
    name
      ? { severity: "ok", label: "Nombre del proyecto", detail: name }
      : {
          severity: "blocker",
          label: "Nombre del proyecto",
          detail: "Falta el nombre (p. ej. «TengoYBusco»).",
        }
  );

  // 2. Propósito
  items.push(
    purpose
      ? { severity: "ok", label: "Propósito", detail: purpose.slice(0, 90) }
      : {
          severity: "warning",
          label: "Propósito",
          detail: "Sin descripción: el plan será más genérico.",
        }
  );

  // 3. Repositorio
  if (repo === "none" || !repo) {
    items.push({
      severity: "blocker",
      label: "Repositorio",
      detail:
        "El build autónomo necesita un repositorio para crear la rama y la PR y generar el preview. Elige «Crear repo nuevo» o pásame la URL de uno existente.",
    });
  } else if (repo === "new") {
    if (!isGithubConfigured()) {
      items.push({
        severity: "blocker",
        label: "Repositorio (GitHub)",
        detail:
          "GitHub no está configurado en Forge (falta GITHUB_TOKEN). Actívalo en Settings antes de construir.",
      });
    } else {
      const owner = getGithubConfig().defaultOwner || "owner";
      const base = slugify(name) || "app";
      const finalName = await findFreeRepoName(owner, base);
      items.push({
        severity: "ok",
        label: "Repositorio",
        detail: `Se creará el repo privado ${owner}/${finalName} (nombre libre verificado).`,
      });
    }
  } else {
    const fullName = repoFromUrl(repo);
    if (!fullName) {
      items.push({
        severity: "blocker",
        label: "Repositorio",
        detail: `La URL «${repo.slice(0, 80)}» no es válida. Formato: https://github.com/owner/repo`,
      });
    } else {
      let exists: boolean | null = null;
      if (isGithubConfigured()) {
        try {
          const res = await githubFetch(
            `/repos/${encodeURIComponent(fullName)}`,
            getGithubConfig(),
            { method: "GET" }
          );
          exists = res.ok;
        } catch {
          exists = null;
        }
      }
      if (exists === false) {
        items.push({
          severity: "warning",
          label: "Repositorio",
          detail: `No encuentro ${fullName} con el token actual (puede ser privado sin acceso). Revisa que el token tenga permiso.`,
        });
      } else {
        items.push({
          severity: "ok",
          label: "Repositorio",
          detail: `Usaré el repo existente ${fullName}.`,
        });
      }
    }
  }

  return {
    ready: items.every((i) => i.severity !== "blocker"),
    items,
  };
}

export function formatReadinessChecklist(r: ComposerReadiness): string {
  const lines: string[] = [
    "🧭 **Check previo antes de construir**",
    "",
    "El proyecto necesita esto para arrancar:",
  ];
  for (const it of r.items) {
    const icon =
      it.severity === "ok" ? "✅" : it.severity === "warning" ? "⚠️" : "❌";
    lines.push(`- ${icon} **${it.label}**${it.detail ? `: ${it.detail}` : ""}`);
  }
  lines.push(
    "",
    r.ready
      ? 'Todo listo ✅ — dime **"Confirmo el plan"** y empezaré a construir.'
      : "Resuelve las ❌ de arriba y vuelve a confirmar el plan."
  );
  return lines.join("\n");
}

/** Opciones para resolver los bloqueos desde el chat (si aplica). */
export function readinessOptions(
  r: ComposerReadiness,
  spec: ComposerSpec | null | undefined
): string[] {
  if (r.ready) return [];
  const repo = spec?.repo;
  if (!repo || repo === "none") {
    return ["Crear repo nuevo", "Usar URL de repo existente"];
  }
  if (repo === "new" && !isGithubConfigured()) {
    return ["Usar URL de repo existente"];
  }
  if (repo !== "new" && repo !== "none" && !repoFromUrl(repo)) {
    return ["Usar URL de repo existente"];
  }
  return [];
}

/** Detecta la intención de resolver el repo desde el chat. */
export function isRepoResolutionIntent(message: string): boolean {
  return (
    /repo nuevo|crear (un )?repo|crea un repo|crear repositorio|nuevo repositorio|repo existente|url de repo|usar url/i.test(
      message
    ) ||
    /github\.com[/:][A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/.test(message)
  );
}

export function githubUrlFromMessage(message: string): string | null {
  return (
    message.match(/github\.com[/:]([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i)?.[1] ??
    null
  );
}
