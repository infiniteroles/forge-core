// Fase 6.0 — Chat Composer: materialize the approved plan into a real project.
// Creates a Forge Project (from the spec) + a build task (from the plan), and
// links the repository when the spec provides one. The autonomous build then
// continues from the project via the existing WorkSession machinery.

import { prisma } from "@/lib/db";
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
): Promise<{ projectId: string; taskId: string; repoFullName: string | null }> {
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

  return { projectId: project.id, taskId: task.id, repoFullName };
}
