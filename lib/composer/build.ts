// Fase 6.0 — Chat Composer: materialize the approved plan into a real project.
// Creates a Forge Project (from the spec) + a build task (from the plan), links
// the repository (existing URL or creates a new one via the GitHub API), and
// kicks off the autonomous build (WorkSession) in the background.

import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { runDevWorkSession } from "@/lib/work-sessions/orchestrator";
import { isGithubConfigured } from "@/lib/github/client";
import { createRepository } from "@/lib/github/create-repository";
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

  // Create a brand-new repository when the spec asks for one.
  if (spec.repo === "new" && !repoFullName && isGithubConfigured()) {
    try {
      const created = await createRepository({
        name: slug,
        description: spec.purpose,
        visibility: "private",
      });
      repoFullName = created.fullName;
      repoUrl = created.htmlUrl;
    } catch (err) {
      console.error("composer repo creation failed:", err);
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
