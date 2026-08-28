// Fase 6.7 — Borrado COMPLETO de un proyecto (liberar recursos).
// Elimina el proyecto y todo lo relacionado de la BD (cascade), y de forma
// best-effort borra el repo de GitHub y las apps preview de Coolify asociadas.

import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import {
  githubFetch,
  getGithubConfig,
  isGithubConfigured,
} from "@/lib/github/client";
import { coolifyFetch, isCoolifyConfigured } from "@/lib/coolify/client";

export async function deleteProjectCompletely(
  projectId: string,
  opts: { deleteRepo?: boolean; deletePreviews?: boolean } = {}
): Promise<{
  deleted: boolean;
  projectName: string;
  repoDeleted: boolean;
  previewsDeleted: number;
}> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      previewDeployments: {
        select: { id: true, coolifyApplicationUuid: true },
      },
    },
  });
  if (!project) throw new Error("Project not found");

  // 1) Borrar el repo de GitHub (best-effort, no bloquea el borrado).
  let repoDeleted = false;
  if (
    opts.deleteRepo !== false &&
    project.repositoryFullName &&
    project.repositoryProvider === "github" &&
    isGithubConfigured()
  ) {
    try {
      const cfg = getGithubConfig();
      const res = await githubFetch(
        `/repos/${encodeURIComponent(project.repositoryFullName)}`,
        cfg,
        { method: "DELETE" }
      );
      repoDeleted = res.ok;
    } catch (err) {
      console.error("delete project: github repo delete failed:", err);
    }
  }

  // 2) Borrar las apps preview de Coolify (best-effort).
  let previewsDeleted = 0;
  if (opts.deletePreviews !== false && isCoolifyConfigured()) {
    for (const p of project.previewDeployments) {
      if (!p.coolifyApplicationUuid) continue;
      try {
        await coolifyFetch(`/applications/${p.coolifyApplicationUuid}`, {
          method: "DELETE",
        });
        previewsDeleted++;
      } catch (err) {
        console.error("delete project: coolify preview delete failed:", err);
      }
    }
  }

  // 3) Eliminar el proyecto (cascade en BD: tasks, workSessions, previews,
  //    readiness, promotions, jobs, activity, composerSessions, agentRuns…).
  const projectName = project.name;
  await prisma.project.delete({ where: { id: projectId } });

  await logActivity({
    projectId: null,
    type: "project.deleted",
    message: `Proyecto "${projectName}" borrado por completo (repo: ${repoDeleted ? "sí" : "no"}, previews eliminadas: ${previewsDeleted})`,
    metadata: { projectId, repoDeleted, previewsDeleted },
  });

  return { deleted: true, projectName, repoDeleted, previewsDeleted };
}
