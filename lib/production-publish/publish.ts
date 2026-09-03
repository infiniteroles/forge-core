// Fase 7 — Publicación automática del producto del Composer.
// Deja el MVP publicado en un subdominio estable con el NOMBRE DEL PRODUCTO
// (<slug>.dev.core01.io) pulsando "Publicar" en el chat del Composer.
//
// Diseño (v1, decidido con el usuario 2026-09-02):
//   - Dominio: <producto>.dev.core01.io
//   - Gatillo: un clic "Publicar" cuando el preview está listo
//   - Se publica DESDE LA RAMA de la tarea (el código exacto previsualizado y
//     aprobado), en una app de Coolify por proyecto. NUNCA mergea a main (la
//     rama es la "verdad" del build iterativo) → re-publicar = redeploy de la
//     misma rama con el último commit.
//   - Guardrails: nunca toca el repo/app de Forge Core01; el dominio siempre es
//     <slug>.<domainSuffix>; nunca expone secretos.

import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import {
  isCoolifyConfigured,
  coolifyFetch,
  getCoolifyConfig,
  listCoolifyApplications,
} from "@/lib/coolify/client";
import { setPreviewApplicationEnvironment } from "@/lib/coolify/environment";
import { checkRepository } from "@/lib/github/repository";
import { getComposerSpecForProject } from "@/lib/composer/spec-resolver";

/** Slug DNS-friendly del nombre del producto (para el subdominio). */
export function productSlug(name: string): string {
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

export interface PublishResult {
  ok: boolean;
  publishedUrl?: string;
  domain?: string;
  status: "deploying" | "ready" | "failed" | "reused";
  reused?: boolean;
  error?: string;
}

export interface PublishedStatus {
  published: boolean;
  publishedUrl?: string | null;
  publishedAt?: Date | null;
  status?: "ready" | "deploying" | "unknown";
}

/** Estado actual de la publicación (si la URL responde → ready). */
export async function getPublishedStatus(
  projectId: string
): Promise<PublishedStatus> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      productionUrl: true,
      publishedAppUuid: true,
      publishedAt: true,
    },
  });
  if (!project?.productionUrl) return { published: false };

  let reachable = false;
  try {
    const res = await fetch(project.productionUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    reachable = res.ok;
  } catch {
    reachable = false;
  }

  return {
    published: true,
    publishedUrl: project.productionUrl,
    publishedAt: project.publishedAt,
    status: reachable ? "ready" : "deploying",
  };
}

/**
 * Publica el producto del proyecto en <slug>.dev.core01.io desplegando la rama
 * actual de su primera tarea (el código previsualizado). Idempotente: si el
 * proyecto ya tiene app publicada, reutiliza esa app (mismo dominio) y relanza
 * el deploy (refleja el último commit de la rama).
 */
export async function publishProduct(
  projectId: string
): Promise<PublishResult> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return { ok: false, status: "failed", error: "Proyecto no encontrado." };
  }
  if (!project.repositoryFullName) {
    return {
      ok: false,
      status: "failed",
      error: "El proyecto no tiene repositorio vinculado.",
    };
  }
  if (!isCoolifyConfigured()) {
    return {
      ok: false,
      status: "failed",
      error: "Coolify no está configurado (COOLIFY_API_TOKEN).",
    };
  }

  // Rama a publicar: la de la primera tarea (la del build del Composer).
  const task = await prisma.task.findFirst({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const branch = task?.githubBranchName;
  if (!branch) {
    return {
      ok: false,
      status: "failed",
      error:
        "Aún no hay rama de build que publicar: primero construye el MVP (aparecerá el preview).",
    };
  }

  const spec = await getComposerSpecForProject(projectId).catch(() => null);
  const name = spec?.name || project.name;
  const slug = productSlug(name);
  const cfg = getCoolifyConfig();
  const suffix = cfg.domainSuffix.startsWith(".")
    ? cfg.domainSuffix
    : `.${cfg.domainSuffix}`;
  const domain = `${slug}${suffix}`;
  const publishedUrl = `https://${domain}`;

  // ── 1) Reutilizar la app publicada si ya existe (mismo dominio). ──
  let applicationUuid = project.publishedAppUuid ?? null;
  let reused = false;
  if (!applicationUuid) {
    try {
      const apps = await listCoolifyApplications();
      const match = apps.find((a) =>
        a.domains
          ? a.domains
              .split(",")
              .map((d) => d.trim())
              .includes(domain)
          : false
      );
      if (match?.uuid) {
        applicationUuid = match.uuid;
        reused = true;
      }
    } catch {
      // si no podemos listar, intentamos crear; Coolify avisará si ya existe
    }
  }

  // ── 2) Crear la app de producto si no existe. ──
  if (!applicationUuid) {
    let repoIsPrivate = false;
    try {
      const repo = await checkRepository(project.repositoryFullName);
      repoIsPrivate = repo.visibility === "private";
    } catch {
      repoIsPrivate = false;
    }

    const common: Record<string, unknown> = {
      project_uuid: cfg.projectUuid ?? undefined,
      server_uuid: cfg.serverUuid ?? undefined,
      environment_name: cfg.environmentName,
      git_branch: branch,
      build_pack: cfg.buildPack,
      ports_exposes: cfg.defaultPort,
      domains: publishedUrl,
      instant_deploy: false,
      name: slug,
    };

    let endpoint = "/applications/public";
    let body: Record<string, unknown>;
    if (repoIsPrivate) {
      if (!cfg.githubAppUuid) {
        return {
          ok: false,
          status: "failed",
          error:
            "El repositorio es privado y no hay GitHub App configurada en Coolify (COOLIFY_GITHUB_APP_UUID).",
        };
      }
      endpoint = "/applications/private-github-app";
      body = {
        ...common,
        github_app_uuid: cfg.githubAppUuid,
        git_repository: project.repositoryFullName,
      };
    } else {
      body = {
        ...common,
        git_repository: `https://github.com/${project.repositoryFullName}`,
      };
    }

    // Coolify puede devolver un 404 transitorio justo tras crear el recurso.
    let created: { uuid?: string } | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        created = await coolifyFetch<{ uuid?: string }>(endpoint, {
          method: "POST",
          body: JSON.stringify(body),
        });
        break;
      } catch (error) {
        lastError = error;
        const msg =
          error instanceof Error ? error.message.toLowerCase() : "";
        const transient =
          /not found/i.test(msg) ||
          (typeof error === "object" &&
            error !== null &&
            (error as { code?: string }).code === "not_found");
        if (!transient) break;
        await new Promise((resolve) =>
          setTimeout(resolve, 1500 * (attempt + 1))
        );
      }
    }
    if (!created?.uuid) {
      return {
        ok: false,
        status: "failed",
        error:
          (lastError instanceof Error
            ? lastError.message
            : "Coolify no devolvió un UUID de aplicación") +
          " — publica otra vez o revisa Coolify.",
      };
    }
    applicationUuid = created.uuid;
  }

  // ── 3) Env runtime (shared_dev, como los previews; denylist de secretos). ──
  const envResult = await setPreviewApplicationEnvironment({
    applicationUuid,
    domain,
  });

  // ── 4) Disparar el deploy (POST /applications/{uuid}/start). ──
  const data = await coolifyFetch<{
    deployments?: { uuid?: string }[];
    deployment_uuid?: string;
  }>(`/applications/${encodeURIComponent(applicationUuid)}/start`, {
    method: "POST",
  });
  const deployment = data?.deployments?.[0];
  const deploymentUuid = deployment?.uuid ?? data?.deployment_uuid ?? null;

  // ── 5) Persistir en el proyecto. ──
  await prisma.project.update({
    where: { id: project.id },
    data: {
      productionUrl: publishedUrl,
      publishedAppUuid: applicationUuid,
      publishedAt: new Date(),
      repositoryLastCheckedAt: new Date(),
    },
  });

  await logActivity({
    projectId: project.id,
    type: reused ? "publish.reused" : "publish.created",
    message: reused
      ? `Producto re-desplegado en ${publishedUrl} (rama ${branch}).`
      : `Producto publicado en ${publishedUrl} (rama ${branch}).`,
    metadata: {
      projectId: project.id,
      taskId: task.id,
      branchName: branch,
      domain,
      publishedUrl,
      applicationUuid,
      deploymentUuid,
      envMode: envResult.mode,
      envConfigured: envResult.configured,
    },
  });

  return {
    ok: true,
    publishedUrl,
    domain,
    status: "deploying",
    reused,
  };
}
