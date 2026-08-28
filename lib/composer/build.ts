// Fase 6.0 — Chat Composer: materialize the approved plan into a real project.
// Creates a Forge Project (from the spec) + a build task (from the plan), links
// the repository (existing URL or creates a new one via the GitHub API), and
// kicks off the autonomous build (WorkSession) in the background.

import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import {
  runDevWorkSession,
  runIterationWorkSession,
} from "@/lib/work-sessions/orchestrator";
import { isGithubConfigured } from "@/lib/github/client";
import { createRepository } from "@/lib/github/create-repository";
import { pushComposerHandoff } from "@/lib/composer/handoff";
import type { ComposerPlan, ComposerProposal, ComposerSpec } from "./types";

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

function repoFromUrl(url: string): { repoUrl: string; fullName: string | null } {
  const repoUrl = url.trim();
  const m = repoUrl.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/i);
  return { repoUrl, fullName: m ? m[1] : null };
}

export async function createComposerProject(
  spec: ComposerSpec,
  proposal: ComposerProposal,
  plan: ComposerPlan | null
): Promise<{
  projectId: string;
  taskId: string;
  repoFullName: string | null;
  workSessionId: string | null;
}> {
  const baseSlug = slugify(spec.name);
  let slug = baseSlug;
  let n = 2;
  while (await prisma.project.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${n++}`;
  }

  let repoUrl: string | null = null;
  let repoFullName: string | null = null;
  if (spec.repo && spec.repo !== "none" && spec.repo !== "new") {
    const parsed = repoFromUrl(spec.repo);
    repoUrl = parsed.repoUrl;
    repoFullName = parsed.fullName;
  }

  // Create a brand-new repository when the spec asks for one. Los nombres de
  // repo en GitHub son globales por org: si el slug ya existe (p. ej. de un
  // intento anterior), se reintenta con slug-2, slug-3… hasta encontrar hueco.
  // Si aun así falla, se LANZA un error claro (el route lo muestra en el chat)
  // en lugar de crear un proyecto muerto sin build en silencio.
  if (spec.repo === "new" && !repoFullName && isGithubConfigured()) {
    const maxAttempts = 5;
    let lastError: unknown = null;
    for (let n = 0; n < maxAttempts; n++) {
      const candidate = n === 0 ? slug : `${slug}-${n + 1}`;
      try {
        const created = await createRepository({
          name: candidate,
          description: spec.purpose,
          visibility: "private",
        });
        repoFullName = created.fullName;
        repoUrl = created.htmlUrl;
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!repoFullName) {
      throw new Error(
        `No pude crear un repositorio nuevo para "${spec.name}" ` +
          `(probé ${maxAttempts} nombres: ${slug}, ${slug}-2, …). ` +
          (lastError instanceof Error
            ? lastError.message
            : "Error de GitHub.")
      );
    }
  }

  const stack = proposal.stack;
  const project = await prisma.project.create({
    data: {
      name: spec.name,
      slug,
      description: spec.purpose || undefined,
      status: "draft",
      preferredStack:
        stack.frontend && stack.frontend !== stack.backend
          ? `${stack.frontend} · ${stack.backend}`
          : stack.frontend,
      repoUrl: repoUrl ?? undefined,
      repositoryProvider: repoFullName ? "github" : null,
      repositoryFullName: repoFullName,
      repositoryVisibility: repoFullName ? "private" : null,
    },
  });

  const task = await prisma.task.create({
    data: {
      projectId: project.id,
      title: `MVP inicial — ${spec.purpose.slice(0, 80) || spec.name}`,
      description:
        `Construido desde el Chat Composer.\n\n` +
        `**Propósito**: ${spec.purpose}\n` +
        (plan ? `**Plan**: ${plan.summary}\n` : "") +
        (plan ? `**Fases**: ${plan.phases.join(" · ")}\n` : "") +
        (plan ? `**Pruebas**: ${plan.testStrategy}\n` : ""),
      type: "backend",
      priority: "high",
      status: "todo",
      sortOrder: 0,
    },
  });

  await logActivity({
    projectId: project.id,
    type: "composer.project_created",
    message: `Composer creó el proyecto ${spec.name} con tarea MVP inicial`,
    metadata: { taskId: task.id, repoFullName },
  });

  // Kick off the autonomous build in the background when a repo is linked.
  let workSessionId: string | null = null;
  if (repoFullName) {
    // Fase 6.6 — handoff a IDE: sube README/AGENTS/copilot-instructions a main
    // ANTES de que el builder cree su rama, para que la rama también las herede
    // y el usuario pueda clonar y continuar con Copilot desde el minuto uno.
    try {
      const handoff = await pushComposerHandoff(repoFullName, spec, proposal, plan);
      await logActivity({
        projectId: project.id,
        type: "composer.handoff_created",
        message: `Handoff a IDE creado en ${repoFullName} (${handoff.pushed.join(", ")})`,
        metadata: { repositoryFullName: repoFullName, files: handoff.pushed },
      });
    } catch (err) {
      console.error("composer handoff push failed:", err);
    }

    const objective =
      `Construir el MVP de ${spec.name}: ${spec.purpose}. ` +
      (plan ? `Plan: ${plan.summary} ` : "") +
      (plan ? `Fases: ${plan.phases.join(", ")}.` : "");
    try {
      const ws = await prisma.workSession.create({
        data: {
          projectId: project.id,
          taskId: task.id,
          mode: "dev",
          status: "queued",
          objective,
        },
      });
      workSessionId = ws.id;
      await logActivity({
        projectId: project.id,
        type: "work_session.started",
        message: `Build autónomo iniciado desde el Composer: ${objective.slice(0, 120)}`,
        metadata: { workSessionId: ws.id, taskId: task.id, mode: "dev" },
      });
      void runDevWorkSession(ws.id).catch((err) => {
        console.error("composer autonomous build failed:", err);
      });
    } catch (err) {
      console.error("composer work session kickoff failed:", err);
    }
  }

  return { projectId: project.id, taskId: task.id, repoFullName, workSessionId };
}

/**
 * Fase 6.5 — iterate by chat. Treats a chat message on an already-building
 * project as a change request: creates a new iteration WorkSession (reusing
 * the task/branch/PR) and runs it in the background so the preview regenerates.
 */
export async function startComposerIteration(
  projectId: string,
  changeRequest: string
): Promise<{ workSessionId: string | null; error?: string }> {
  const task = await prisma.task.findFirst({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (!task) {
    return {
      workSessionId: null,
      error: "El proyecto no tiene ninguna tarea de build para iterar.",
    };
  }

  const lastSession = await prisma.workSession.findFirst({
    where: { taskId: task.id },
    orderBy: { createdAt: "desc" },
  });

  const iterationNumber = (lastSession?.iterationNumber ?? 0) + 1;
  const ws = await prisma.workSession.create({
    data: {
      projectId,
      taskId: task.id,
      mode: "iteration",
      status: "queued",
      objective: changeRequest,
      requestedChanges: changeRequest,
      parentWorkSessionId: lastSession?.id ?? null,
      iterationNumber,
    },
  });

  await logActivity({
    projectId,
    type: "work_session.iteration_started",
    message: `Iteración desde el Composer: ${changeRequest.slice(0, 120)}`,
    metadata: {
      workSessionId: ws.id,
      taskId: task.id,
      iterationNumber,
      mode: "iteration",
    },
  });

  void runIterationWorkSession(ws.id).catch((err) => {
    console.error("composer iteration failed:", err);
  });

  return { workSessionId: ws.id };
}
