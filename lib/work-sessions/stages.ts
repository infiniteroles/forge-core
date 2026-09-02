import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getLLMConfig } from "@/lib/llm/client";
import { createIssue } from "@/lib/github/issues";
import { createBranch, getBranchRef } from "@/lib/github/branches";
import { generateBranchNameCandidates } from "@/lib/github/branch-name";
import {
  createOrUpdateFile,
  createOrUpdateFiles,
  getFileContent,
} from "@/lib/github/files";
import {
  buildPlanPath,
  buildPlanCommitMessage,
  generatePlanMarkdown,
} from "@/lib/github/task-plan";
import {
  createPullRequest,
  findOpenPullRequestForBranch,
  getPullRequest,
} from "@/lib/github/pull-requests";
import {
  buildPullRequestTitle,
  buildPullRequestBody,
} from "@/lib/github/pull-request";
import { runBuilderProposalAgent } from "@/lib/llm/builder-proposal";
import { parseBuilderProposalOutput } from "@/lib/llm/builder-proposal";
import { generateBuilderCommitChanges } from "@/lib/llm/builder-commit";
import { runPrReviewAgent } from "@/lib/llm/pr-review";
import { readRepoFiles } from "@/lib/github/context";
import { persistableUsage } from "@/lib/llm-efficiency/cost-policy";
import { shouldReusePrReview } from "@/lib/llm-efficiency/pr-review-cache";
import { buildNextJsScaffold } from "@/lib/scaffold/nextjs";
import {
  specAccent,
  specBackground,
  specPalette,
  specRequiresAuth,
} from "@/lib/composer/spec-resolver";
import { isCoolifyConfigured } from "@/lib/coolify/client";
import { getPreviewRunnerMode, prepareDevPreview } from "@/lib/coolify/preview";
import { runSessionChecks } from "./checks";
import type { Prisma } from "@prisma/client";
import type { StageOutcome, WorkSessionResult } from "./types";

export interface StageContext {
  workSessionId: string;
  taskId: string;
  mode: string;
  requestedChanges: string | null;
  iterationNumber: number;
  parentWorkSessionId: string | null;
  isIteration: boolean;
  /** Spec del Composer vinculada al proyecto (paleta, auth, logo, uiLibrary…). */
  composerSpec?: import("@/lib/composer/types").ComposerSpec | null;
  task: {
    id: string;
    projectId: string;
    title: string;
    description: string | null;
    notes: string | null;
    type: string;
    priority: string;
    status: string;
    githubIssueNumber: number | null;
    githubIssueUrl: string | null;
    githubBranchName: string | null;
    githubPrNumber: number | null;
    githubPrUrl: string | null;
    githubPlanCommitSha: string | null;
  };
  project: {
    id: string;
    name: string;
    repositoryFullName: string | null;
    repositoryDefaultBranch: string | null;
  };
  result: WorkSessionResult;
}

function taskForMd(task: StageContext["task"]) {
  return {
    id: task.id,
    title: task.title,
    type: task.type,
    priority: task.priority,
    status: task.status,
    assignedAgent: null,
    description: task.description,
    notes: task.notes,
    githubBranchName: task.githubBranchName,
    githubIssueUrl: task.githubIssueUrl,
  };
}

function taskForPr(task: StageContext["task"]) {
  return {
    id: task.id,
    title: task.title,
    type: task.type,
    priority: task.priority,
    status: task.status,
    description: task.description,
    notes: task.notes,
    githubBranchName: task.githubBranchName,
    githubIssueNumber: task.githubIssueNumber,
    githubIssueUrl: task.githubIssueUrl,
    githubPlanCommitUrl: null,
  };
}

// ── ensure_issue ─────────────────────────────────────────────────────────────

export async function stageEnsureIssue(ctx: StageContext): Promise<StageOutcome> {
  if (!ctx.project.repositoryFullName) {
    return {
      type: "waiting_for_user",
      reason: "The project has no linked repository. Link one before continuing.",
    };
  }

  if (ctx.task.githubIssueNumber) {
    ctx.result.issueUrl = ctx.task.githubIssueUrl;
    return { type: "continue" };
  }

  const issue = await createIssue({
    repositoryFullName: ctx.project.repositoryFullName,
    title: ctx.task.title,
    body: ctx.task.description ?? ctx.task.title,
  });

  await prisma.task.update({
    where: { id: ctx.task.id },
    data: {
      githubIssueNumber: issue.number,
      githubIssueUrl: issue.html_url,
      githubIssueState: issue.state,
      githubIssueTitle: issue.title,
      githubIssueCreatedAt: issue.created_at ? new Date(issue.created_at) : null,
    },
  });

  await logActivity({
    projectId: ctx.task.projectId,
    type: "github.issue.created",
    message: `GitHub issue created for task "${ctx.task.title}"`,
    metadata: {
      taskId: ctx.task.id,
      workSessionId: ctx.workSessionId,
      issueNumber: issue.number,
      issueUrl: issue.html_url,
    },
  });

  ctx.result.issueUrl = issue.html_url;
  return { type: "continue" };
}

// ── ensure_branch ────────────────────────────────────────────────────────────

export async function stageEnsureBranch(ctx: StageContext): Promise<StageOutcome> {
  if (!ctx.project.repositoryFullName) {
    return {
      type: "waiting_for_user",
      reason: "The project has no linked repository. Link one before continuing.",
    };
  }

  if (ctx.task.githubBranchName) {
    return { type: "continue" };
  }

  const defaultBranch = ctx.project.repositoryDefaultBranch || "main";

  const baseRef = await getBranchRef({
    repositoryFullName: ctx.project.repositoryFullName,
    branchName: defaultBranch,
  });

  const candidates = generateBranchNameCandidates(ctx.task);
  let created = null;
  for (const name of candidates) {
    try {
      created = await createBranch({
        repositoryFullName: ctx.project.repositoryFullName,
        branchName: name,
        baseSha: baseRef.sha,
      });
      break;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "branch_already_exists") throw error;
    }
  }

  if (!created) {
    return {
      type: "failed",
      error: "Could not find a free branch name for this task.",
    };
  }

  await prisma.task.update({
    where: { id: ctx.task.id },
    data: {
      githubBranchName: created.name,
      githubBranchUrl: created.url,
      githubBaseBranch: defaultBranch,
      githubBaseSha: created.sha ?? baseRef.sha,
      githubBranchCreatedAt: new Date(),
    },
  });

  await logActivity({
    projectId: ctx.task.projectId,
    type: "github.branch.created",
    message: `GitHub branch created for task "${ctx.task.title}"`,
    metadata: {
      taskId: ctx.task.id,
      workSessionId: ctx.workSessionId,
      branchName: created.name,
      branchUrl: created.url,
    },
  });

  ctx.result.branchUrl = created.url;
  return { type: "continue" };
}

// ── ensure_plan_commit ───────────────────────────────────────────────────────

export async function stageEnsurePlanCommit(
  ctx: StageContext
): Promise<StageOutcome> {
  if (!ctx.project.repositoryFullName || !ctx.task.githubBranchName) {
    return {
      type: "waiting_for_user",
      reason: "Task has no branch yet; cannot create the plan commit.",
    };
  }

  if (ctx.task.githubPlanCommitSha) {
    return { type: "continue" };
  }

  const path = buildPlanPath(ctx.task.id);
  const markdown = generatePlanMarkdown({
    task: taskForMd(ctx.task),
    project: { name: ctx.project.name, repositoryFullName: ctx.project.repositoryFullName },
    generatedAt: new Date().toISOString(),
  });

  const commit = await createOrUpdateFile({
    repositoryFullName: ctx.project.repositoryFullName,
    branchName: ctx.task.githubBranchName,
    path,
    message: buildPlanCommitMessage(ctx.task.title),
    content: markdown,
  });

  await prisma.task.update({
    where: { id: ctx.task.id },
    data: {
      githubPlanPath: path,
      githubPlanCommitSha: commit.commitSha,
      githubPlanCommitUrl: commit.commitUrl,
      githubPlanCommitMessage: commit.commitMessage,
      githubPlanCommittedAt: commit.committedAt ? new Date(commit.committedAt) : null,
    },
  });

  await logActivity({
    projectId: ctx.task.projectId,
    type: "github.plan_commit.created",
    message: `Plan commit created for task "${ctx.task.title}"`,
    metadata: {
      taskId: ctx.task.id,
      workSessionId: ctx.workSessionId,
      commitSha: commit.commitSha,
      commitUrl: commit.commitUrl,
    },
  });

  ctx.result.planCommitUrl = commit.commitUrl;
  return { type: "continue" };
}

// ── ensure_draft_pr ──────────────────────────────────────────────────────────

export async function stageEnsureDraftPr(ctx: StageContext): Promise<StageOutcome> {
  if (!ctx.project.repositoryFullName || !ctx.task.githubBranchName) {
    return {
      type: "waiting_for_user",
      reason: "Task has no branch yet; cannot open a draft pull request.",
    };
  }

  if (ctx.task.githubPrNumber) {
    ctx.result.prUrl = ctx.task.githubPrUrl;
    return { type: "continue" };
  }

  const existing = await findOpenPullRequestForBranch({
    repositoryFullName: ctx.project.repositoryFullName,
    headBranch: ctx.task.githubBranchName,
  });
  if (existing) {
    await prisma.task.update({
      where: { id: ctx.task.id },
      data: {
        githubPrNumber: existing.number,
        githubPrUrl: existing.html_url,
        githubPrState: existing.state,
        githubPrTitle: existing.title,
        githubPrDraft: existing.draft,
        githubPrBaseBranch: existing.baseBranch,
        githubPrHeadBranch: existing.headBranch,
        githubPrCreatedAt: existing.created_at ? new Date(existing.created_at) : null,
      },
    });
    ctx.result.prUrl = existing.html_url;
    return { type: "continue" };
  }

  const pr = await createPullRequest({
    repositoryFullName: ctx.project.repositoryFullName,
    title: buildPullRequestTitle(ctx.task.title),
    body: buildPullRequestBody({
      task: taskForPr(ctx.task),
      project: { name: ctx.project.name },
    }),
    baseBranch: ctx.project.repositoryDefaultBranch || "main",
    headBranch: ctx.task.githubBranchName,
    draft: true,
  });

  await prisma.task.update({
    where: { id: ctx.task.id },
    data: {
      githubPrNumber: pr.number,
      githubPrUrl: pr.html_url,
      githubPrState: pr.state,
      githubPrTitle: pr.title,
      githubPrDraft: pr.draft,
      githubPrBaseBranch: pr.baseBranch,
      githubPrHeadBranch: pr.headBranch,
      githubPrCreatedAt: pr.created_at ? new Date(pr.created_at) : null,
    },
  });

  await logActivity({
    projectId: ctx.task.projectId,
    type: "github.pr.created",
    message: `Draft pull request created for task "${ctx.task.title}"`,
    metadata: {
      taskId: ctx.task.id,
      workSessionId: ctx.workSessionId,
      prNumber: pr.number,
      prUrl: pr.html_url,
    },
  });

  ctx.result.prUrl = pr.html_url;
  return { type: "continue" };
}

// ── ensure_scaffold (Fase 6.4c) ──────────────────────────────────────────────
// Si la rama aún no tiene una app, genera un scaffold Next.js + Tailwind
// funcional (con Dockerfile) para que la PR y el preview muestren un MVP real.

async function hasFileOnBranch(
  repositoryFullName: string,
  branchName: string,
  path: string
): Promise<boolean> {
  try {
    await getFileContent({ repositoryFullName, branchName, path });
    return true;
  } catch {
    return false;
  }
}

function extractPurpose(description: string | null): string {
  if (!description) return "";
  const m = description.match(/\*\*Propósito\*\*:\s*(.+)/i);
  return (m?.[1]?.trim() ?? description.trim()) || "";
}

export async function stageEnsureScaffold(
  ctx: StageContext
): Promise<StageOutcome> {
  const repo = ctx.project.repositoryFullName;
  const branch = ctx.task.githubBranchName;
  if (!repo || !branch) return { type: "continue" };

  // Ya hay app en la rama → no repetimos.
  if (await hasFileOnBranch(repo, branch, "package.json")) {
    return { type: "continue" };
  }

  const files = buildNextJsScaffold({
    name: ctx.project.name || ctx.task.title || "App",
    purpose: extractPurpose(ctx.task.description),
    accent: ctx.composerSpec
      ? specAccent(ctx.composerSpec)
      : undefined,
    background: ctx.composerSpec
      ? specBackground(ctx.composerSpec)
      : undefined,
    requiresAuth: ctx.composerSpec
      ? specRequiresAuth(ctx.composerSpec)
      : false,
    uiLibrary: ctx.composerSpec?.uiLibrary ?? "shadcn",
  });

  await createOrUpdateFiles(
    files.map((f) => ({
      repositoryFullName: repo,
      branchName: branch,
      path: f.path,
      message: `chore(scaffold): add ${f.path} (Next.js MVP)`,
      content: f.content,
    }))
  );

  await logActivity({
    projectId: ctx.task.projectId,
    type: "scaffold.created",
    message: `Scaffold Next.js generado para "${ctx.project.name || ctx.task.title}" (${files.length} ficheros)`,
    metadata: {
      taskId: ctx.task.id,
      workSessionId: ctx.workSessionId,
      branchName: branch,
      files: files.map((f) => f.path),
    },
  });

  return { type: "continue" };
}

// ── verify_spec_compliance (Fase 6.24) ───────────────────────────────────────
// QA gate: verifica que el código generado cumple la spec del Composer (paleta
// del logo, página de login si pide auth) y, si no, lanza UNA pasada de fix
// automática con instrucciones concretas. Hace que el build "se corrija solo".

async function applyBuilderResult(
  ctx: StageContext,
  agentRunId: string,
  result: Awaited<ReturnType<typeof generateBuilderCommitChanges>>
) {
  if (result.status === "completed_with_warnings" || !result.changes) {
    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: { status: "completed_with_warnings", finishedAt: new Date() },
    });
    return;
  }
  const commits = await createOrUpdateFiles(
    result.changes.files.map((file) => ({
      repositoryFullName: ctx.project.repositoryFullName!,
      branchName: ctx.task.githubBranchName!,
      path: file.path,
      message: `fix(forge-builder): ${file.operation === "create" ? "add" : "update"} ${file.path} (spec compliance)`.slice(0, 120),
      content: file.content,
    }))
  );
  const lastCommit = commits[commits.length - 1];
  await prisma.task.update({
    where: { id: ctx.task.id },
    data: {
      githubBuilderCommitSha: lastCommit?.commitSha ?? undefined,
      githubBuilderCommitUrl: lastCommit?.commitUrl ?? undefined,
      githubBuilderCommitMessage: lastCommit?.commitMessage ?? undefined,
      githubBuilderCommittedAt: lastCommit?.committedAt
        ? new Date(lastCommit.committedAt)
        : undefined,
      githubBuilderLastCheckedAt: new Date(),
      builderLastRunId: agentRunId,
      builderLastStatus: "completed",
      builderLastSummary: (result.changes?.summary ?? "").slice(0, 300),
    },
  });
  await prisma.agentRun.update({
    where: { id: agentRunId },
    data: {
      status: "completed",
      output: JSON.stringify({
        summary: result.changes.summary,
        files: result.changes.files,
        commits,
      }),
      finishedAt: new Date(),
    },
  });
}

export async function stageVerifySpecCompliance(
  ctx: StageContext
): Promise<StageOutcome> {
  const repo = ctx.project.repositoryFullName;
  const branch = ctx.task.githubBranchName;
  const spec = ctx.composerSpec;
  if (!repo || !branch || !spec) return { type: "continue" };

  const violations: string[] = [];
  const palette = specPalette(spec);

  // Lee los ficheros clave de la rama (best-effort, missing => skip).
  const read = await readRepoFiles({
    repositoryFullName: repo,
    branchName: branch,
    paths: ["app/page.tsx", "app/login/page.tsx"],
    maxFiles: 5,
  });
  const page = read.files.find((f) => f.path === "app/page.tsx");
  const loginPage = read.files.find((f) => f.path === "app/login/page.tsx");

  // 1) La landing usa la paleta del logo.
  if (palette.length > 0) {
    if (!page) {
      violations.push("No se encontró app/page.tsx para verificar la paleta.");
    } else {
      const lower = page.content.toLowerCase();
      const used = palette.filter((c) => lower.includes(c.toLowerCase()));
      if (used.length === 0) {
        violations.push(
          `La landing NO usa la paleta del logo (${palette.join(", ")}).`
        );
      }
    }
  }

  // 2) Si la spec pide auth, debe existir la página de login.
  if (specRequiresAuth(spec) && !loginPage) {
    violations.push(
      "La spec pide autenticación pero no existe app/login/page.tsx."
    );
  }

  if (violations.length === 0) {
    await logActivity({
      projectId: ctx.task.projectId,
      type: "spec.compliant",
      message: `Código cumple la spec del Composer (paleta/auth).`,
      metadata: {
        taskId: ctx.task.id,
        workSessionId: ctx.workSessionId,
        branchName: branch,
      },
    });
    return { type: "continue" };
  }

  // Auto-fix: UNA pasada extra del builder con la instrucción de cumplimiento.
  const fixInstruction =
    "Cumple EXACTAMENTE la especificación del producto (sección 'Especificación del producto' del contexto).\n" +
    "Problemas detectados por QA:\n- " +
    violations.join("\n- ") +
    "\nAplica los cambios necesarios (usa la paleta indicada, crea/ajusta la página de login si se pide auth). No añadas features que no estén en la spec.";

  await logActivity({
    projectId: ctx.task.projectId,
    type: "spec.violation",
    message: `QA detectó incumplimiento de spec (${violations.length}): ${violations.join(" | ")}`,
    metadata: {
      taskId: ctx.task.id,
      workSessionId: ctx.workSessionId,
      branchName: branch,
      violations,
    },
  });

  const run = await prisma.agentRun.create({
    data: {
      projectId: ctx.task.projectId,
      taskId: ctx.task.id,
      workSessionId: ctx.workSessionId,
      agentName: "builder-commit",
      model: getLLMConfig().model,
      status: "running",
      startedAt: new Date(),
    },
  });

  try {
    const result = await generateBuilderCommitChanges(ctx.task.id, {
      requestedChanges: fixInstruction,
      iterationNumber: (ctx.iterationNumber ?? 0) + 1,
      workSessionId: ctx.workSessionId,
    });
    await applyBuilderResult(ctx, run.id, result);
    await logActivity({
      projectId: ctx.task.projectId,
      type: "spec.auto_fixed",
      message: `QA auto-corrigió la spec (commit en la rama).`,
      metadata: {
        taskId: ctx.task.id,
        agentRunId: run.id,
        workSessionId: ctx.workSessionId,
        violations,
      },
    });
    ctx.result.warnings?.push(`spec_fixed: ${violations.join(" | ")}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Fix falló";
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "failed", finishedAt: new Date() },
    });
    await logActivity({
      projectId: ctx.task.projectId,
      type: "spec.auto_fix_failed",
      message: `QA no pudo auto-corregir la spec: ${msg}`,
      metadata: {
        taskId: ctx.task.id,
        agentRunId: run.id,
        workSessionId: ctx.workSessionId,
      },
    });
    ctx.result.warnings?.push(`spec_fix_failed: ${msg}`);
  }

  // No bloquea el build: si la corrección no llega, el preview sigue igual.
  return { type: "continue" };
}

// ── ensure_dev_preview (Fase 6.4c) ───────────────────────────────────────────
// Al terminar el build, genera el DEV Preview automáticamente (si Coolify está
// configurado) para que el Composer lo muestre al lado del chat.

export async function stageEnsureDevPreview(
  ctx: StageContext
): Promise<StageOutcome> {
  const repo = ctx.project.repositoryFullName;
  const branch = ctx.task.githubBranchName;
  if (!repo || !branch) return { type: "continue" };
  if (getPreviewRunnerMode() === "disabled" || !isCoolifyConfigured()) {
    return { type: "continue" };
  }

  // Fase 6.25 — agilidad: si el builder no produjo commit nuevo en ESTA sesión
  // (ctx.result.builderCommitUrl null, marcado por stageRunBuilderCommit) y ya
  // existe una preview ready y reciente de la MISMA tarea (rama), no relanzamos
  // un deploy inútil: el código de la rama no cambió.
  if (!ctx.result.builderCommitUrl) {
    const last = await prisma.previewDeployment.findFirst({
      where: { projectId: ctx.task.projectId, taskId: ctx.task.id },
      orderBy: { createdAt: "desc" },
    });
    const readyRecently =
      last?.status === "ready" &&
      !!last.lastCheckedAt &&
      Date.now() - last.lastCheckedAt.getTime() < 15 * 60 * 1000;
    if (readyRecently) {
      await logActivity({
        projectId: ctx.task.projectId,
        type: "preview.skipped_no_changes",
        message:
          "DEV Preview sin cambios: builder sin commit nuevo y preview ready reciente.",
        metadata: {
          workSessionId: ctx.workSessionId,
          taskId: ctx.task.id,
          previewDeploymentId: last!.id,
          previewUrl: last!.previewUrl ?? null,
        },
      });
      return { type: "continue" };
    }
  }

  try {
    const preview = await prepareDevPreview({
      projectId: ctx.task.projectId,
      taskId: ctx.task.id,
      workSessionId: ctx.workSessionId,
      repositoryFullName: repo,
      branchName: branch,
      pullRequestNumber: ctx.task.githubPrNumber,
      commitSha: null,
    });
    await logActivity({
      projectId: ctx.task.projectId,
      type: "preview.auto_requested",
      message: `DEV Preview generado automáticamente (${preview.status})`,
      metadata: {
        workSessionId: ctx.workSessionId,
        taskId: ctx.task.id,
        previewDeploymentId: preview.id,
        status: preview.status,
        previewUrl: preview.previewUrl ?? null,
      },
    });
  } catch (err) {
    console.error("auto preview failed:", err);
  }
  return { type: "continue" };
}

// ── ensure_builder_proposal ──────────────────────────────────────────────────

export async function stageEnsureBuilderProposal(
  ctx: StageContext
): Promise<StageOutcome> {
  // In iteration mode the user gave a NEW instruction, so a previously
  // completed proposal is stale — always produce a fresh one.
  if (!ctx.isIteration) {
    const existing = await prisma.agentRun.findFirst({
      where: { taskId: ctx.task.id, agentName: "builder-proposal", status: "completed" },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      const parsed = parseBuilderProposalOutput(existing.output);
      if (parsed?.safe_to_attempt_next === true) {
        await logActivity({
          projectId: ctx.task.projectId,
          type: "builder.proposal.reused",
          message: `Builder proposal reutilizada para "${ctx.task.title}" (sin cambios).`,
          metadata: {
            taskId: ctx.task.id,
            agentRunId: existing.id,
            workSessionId: ctx.workSessionId,
          },
        });
        return { type: "continue" };
      }
      return {
        type: "waiting_for_user",
        reason:
          "The Builder Proposal says this is not safe to attempt yet. Review it before continuing.",
        autoContinuable: true,
      };
    }
  }

  const run = await prisma.agentRun.create({
    data: {
      projectId: ctx.task.projectId,
      taskId: ctx.task.id,
      workSessionId: ctx.workSessionId,
      agentName: "builder-proposal",
      model: getLLMConfig().model,
      status: "running",
      startedAt: new Date(),
    },
  });

  await logActivity({
    projectId: ctx.task.projectId,
    type: "builder.proposal.created",
    message: `Builder proposal requested for task "${ctx.task.title}"`,
    metadata: { taskId: ctx.task.id, agentRunId: run.id, workSessionId: ctx.workSessionId },
  });

  const result = await runBuilderProposalAgent(ctx.task.id, {
    requestedChanges: ctx.requestedChanges,
    iterationNumber: ctx.iterationNumber,
    workSessionId: ctx.workSessionId,
  });

  const output =
    result.status === "completed"
      ? JSON.stringify(result.output)
      : result.raw;

  await prisma.agentRun.update({
    where: { id: run.id },
    data: { status: result.status, output, model: result.model, finishedAt: new Date(), ...persistableUsage(result) },
  });

  await logActivity({
    projectId: ctx.task.projectId,
    type: "builder.proposal.completed",
    message:
      result.status === "completed"
        ? `Builder proposal ready for task "${ctx.task.title}"`
        : `Builder proposal completed with warnings for task "${ctx.task.title}"`,
    metadata: {
      taskId: ctx.task.id,
      agentRunId: run.id,
      workSessionId: ctx.workSessionId,
      status: result.status,
    },
  });

  if (result.status === "completed") {
    if (result.output.safe_to_attempt_next === true) {
      return { type: "continue" };
    }
    return {
      type: "waiting_for_user",
      reason:
        "The Builder Proposal says this is not safe to attempt yet. Review it before continuing.",
      autoContinuable: true,
    };
  }

  return {
    type: "waiting_for_user",
    reason:
      "The Builder Proposal could not be parsed. Review the raw output before continuing.",
  };
}

// ── run_builder_commit ───────────────────────────────────────────────────────

export async function stageRunBuilderCommit(ctx: StageContext): Promise<StageOutcome> {
  if (!ctx.project.repositoryFullName || !ctx.task.githubBranchName) {
    return { type: "continue" };
  }

  // Fase 6.25 — marcador POR SESIÓN: indica si ESTA sesión generó un commit.
  // ensure_dev_preview lo usa para no relanzar un deploy (~5-10min) cuando el
  // builder no cambió nada (completed_with_warnings conservaba el valor previo).
  ctx.result.builderCommitUrl = null;

  // Already committed in a previous run — except in iteration mode, where the
  // user's new instruction requires a NEW commit on the same branch.
  if (!ctx.isIteration) {
    const committed = await prisma.task.findUnique({ where: { id: ctx.task.id } });
    if (committed?.githubBuilderCommitSha) {
      ctx.result.builderCommitUrl = committed.githubBuilderCommitUrl;
      return { type: "continue" };
    }
  }

  const run = await prisma.agentRun.create({
    data: {
      projectId: ctx.task.projectId,
      taskId: ctx.task.id,
      workSessionId: ctx.workSessionId,
      agentName: "builder-commit",
      model: getLLMConfig().model,
      status: "running",
      startedAt: new Date(),
    },
  });

  await logActivity({
    projectId: ctx.task.projectId,
    type: "builder.commit.created",
    message: `Builder commit run started for task "${ctx.task.title}"`,
    metadata: { taskId: ctx.task.id, agentRunId: run.id, workSessionId: ctx.workSessionId },
  });

  let result: Awaited<ReturnType<typeof generateBuilderCommitChanges>>;
  try {
    result = await generateBuilderCommitChanges(ctx.task.id, {
      requestedChanges: ctx.requestedChanges,
      iterationNumber: ctx.iterationNumber,
      workSessionId: ctx.workSessionId,
    });
  } catch (error) {
    // El LLM del builder commit falló (p. ej. empty_response). No tiramos abajo
    // el build: si ya hay scaffold en la rama, lo registramos y seguimos para
    // poder generar el preview. El código específico se añade en iteraciones.
    const msg =
      error instanceof Error ? error.message : "Builder commit falló";
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        output: JSON.stringify({ status: "failed", reason: msg }),
        finishedAt: new Date(),
      },
    });
    await prisma.task.update({
      where: { id: ctx.task.id },
      data: {
        builderLastRunId: run.id,
        builderLastStatus: "failed",
        builderLastSummary: msg.slice(0, 300),
      },
    });
    await logActivity({
      projectId: ctx.task.projectId,
      type: "builder.commit.failed",
      message: `Builder commit no aplicado (se continúa con el scaffold): ${msg.slice(0, 200)}`,
      metadata: {
        taskId: ctx.task.id,
        agentRunId: run.id,
        workSessionId: ctx.workSessionId,
      },
    });
    return { type: "continue" };
  }

  if (result.status === "completed_with_warnings") {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "completed_with_warnings",
        output: JSON.stringify({
          status: "completed_with_warnings",
          reason: result.reason,
          violations: result.violations ?? [],
          raw: result.raw ?? null,
        }),
        model: result.model ?? undefined,
        finishedAt: new Date(),
        ...persistableUsage(result),
      },
    });

    await prisma.task.update({
      where: { id: ctx.task.id },
      data: {
        builderLastRunId: run.id,
        builderLastStatus: "completed_with_warnings",
        builderLastSummary: result.reason.slice(0, 300),
      },
    });

    await logActivity({
      projectId: ctx.task.projectId,
      type: "builder.commit.completed_with_warnings",
      message: `Builder commit completed with warnings for task "${ctx.task.title}"`,
      metadata: { taskId: ctx.task.id, agentRunId: run.id, workSessionId: ctx.workSessionId },
    });

    return { type: "completed_with_warnings", reason: result.reason };
  }

  const changes = result.changes;
  const commits = await createOrUpdateFiles(
    changes.files.map((file) => ({
      repositoryFullName: ctx.project.repositoryFullName!,
      branchName: ctx.task.githubBranchName!,
      path: file.path,
      message: `feat(forge-builder): ${file.operation === "create" ? "add" : "update"} ${file.path} for ${ctx.task.title}`.slice(0, 120),
      content: file.content,
    }))
  );
  const lastCommit = commits[commits.length - 1];

  await prisma.task.update({
    where: { id: ctx.task.id },
    data: {
      githubBuilderCommitSha: lastCommit?.commitSha ?? null,
      githubBuilderCommitUrl: lastCommit?.commitUrl ?? null,
      githubBuilderCommitMessage: lastCommit?.commitMessage ?? null,
      githubBuilderCommittedAt: lastCommit?.committedAt ? new Date(lastCommit.committedAt) : null,
      githubBuilderLastCheckedAt: new Date(),
      builderLastRunId: run.id,
      builderLastStatus: "completed",
      builderLastSummary: changes.summary.slice(0, 300),
    },
  });

  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      status: "completed",
      output: JSON.stringify({
        summary: changes.summary,
        implementation_notes: changes.implementation_notes,
        files: changes.files,
        validation_plan: changes.validation_plan,
        risks: changes.risks,
        post_commit_notes: changes.post_commit_notes,
        commits,
      }),
      model: result.model,
      finishedAt: new Date(),
      ...persistableUsage(result),
    },
  });

  await logActivity({
    projectId: ctx.task.projectId,
    type: "builder.commit.completed",
    message: `Builder commit created for task "${ctx.task.title}"`,
    metadata: {
      taskId: ctx.task.id,
      agentRunId: run.id,
      workSessionId: ctx.workSessionId,
      commitSha: lastCommit?.commitSha,
      commitUrl: lastCommit?.commitUrl,
      filesChanged: changes.files.length,
    },
  });

  ctx.result.builderCommitUrl = lastCommit?.commitUrl ?? null;
  ctx.result.filesChanged = changes.files.map((f) => f.path);
  return { type: "continue" };
}

// ── analyze_pr ───────────────────────────────────────────────────────────────

export async function stageAnalyzePr(ctx: StageContext): Promise<StageOutcome> {
  if (!ctx.project.repositoryFullName || !ctx.task.githubPrNumber) {
    return { type: "continue" };
  }

  // Fase 4.5 — reuse the stored PR review when the PR head hasn't changed.
  const cache = await shouldReusePrReview({
    repositoryFullName: ctx.project.repositoryFullName,
    prNumber: ctx.task.githubPrNumber,
    taskId: ctx.task.id,
  });
  if (cache.reuse) {
    await logActivity({
      projectId: ctx.task.projectId,
      type: "pr_review.reused",
      message: `PR review reutilizada para "${ctx.task.title}" (head SHA sin cambios).`,
      metadata: {
        taskId: ctx.task.id,
        workSessionId: ctx.workSessionId,
        prHeadSha: cache.prHeadSha,
      },
    });
    return { type: "continue" };
  }

  const prHeadSha =
    (await getPullRequest({
      repositoryFullName: ctx.project.repositoryFullName,
      prNumber: ctx.task.githubPrNumber,
    }).catch(() => null))?.headSha ?? null;

  const run = await prisma.agentRun.create({
    data: {
      projectId: ctx.task.projectId,
      taskId: ctx.task.id,
      workSessionId: ctx.workSessionId,
      agentName: "pr-review",
      model: getLLMConfig().model,
      status: "running",
      startedAt: new Date(),
      metadata: { prHeadSha },
    },
  });

  await logActivity({
    projectId: ctx.task.projectId,
    type: "github.pr_review.created",
    message: `PR review requested for task "${ctx.task.title}"`,
    metadata: {
      taskId: ctx.task.id,
      agentRunId: run.id,
      workSessionId: ctx.workSessionId,
      prNumber: ctx.task.githubPrNumber,
      prUrl: ctx.task.githubPrUrl,
    },
  });

  let result: Awaited<ReturnType<typeof runPrReviewAgent>>;
  try {
    result = await runPrReviewAgent(ctx.task.id);
  } catch (error) {
    // Si el LLM de la PR review falla, no tiramos abajo el build: registramos
    // el fallo y seguimos para poder llegar al preview.
    const msg =
      error instanceof Error ? error.message : "PR review falló";
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        output: JSON.stringify({ status: "failed", reason: msg }),
        finishedAt: new Date(),
      },
    });
    await logActivity({
      projectId: ctx.task.projectId,
      type: "pr_review.failed",
      message: `PR review no completada (se continúa hacia el preview): ${msg.slice(0, 200)}`,
      metadata: {
        taskId: ctx.task.id,
        agentRunId: run.id,
        workSessionId: ctx.workSessionId,
      },
    });
    return { type: "continue" };
  }
  const now = new Date();

  if (result.status === "completed_with_warnings") {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "completed_with_warnings",
        output: JSON.stringify({ status: "completed_with_warnings", reason: result.reason, raw: result.raw }),
        model: result.model,
        finishedAt: now,
        ...persistableUsage(result),
      },
    });
    await prisma.task.update({
      where: { id: ctx.task.id },
      data: {
        githubPrReviewRunId: run.id,
        githubPrReviewStatus: "completed_with_warnings",
        githubPrReviewSummary: result.reason.slice(0, 300),
        githubPrReviewReadyForReview: false,
        githubPrReviewLastCheckedAt: now,
      },
    });
  } else {
    const review = result.output;
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        output: JSON.stringify(review),
        model: result.model,
        finishedAt: now,
        ...persistableUsage(result),
      },
    });
    await prisma.task.update({
      where: { id: ctx.task.id },
      data: {
        githubPrReviewRunId: run.id,
        githubPrReviewStatus: "completed",
        githubPrReviewSummary: review.summary.slice(0, 300),
        githubPrReviewRecommendation: review.recommendation,
        githubPrReviewRiskLevel: review.risk_level,
        githubPrReviewReadyForReview: review.ready_for_review,
        githubPrReviewLastCheckedAt: now,
      },
    });
    ctx.result.prReviewRecommendation = review.recommendation;
  }

  await logActivity({
    projectId: ctx.task.projectId,
    type: "github.pr_review.completed",
    message: `PR review completed for task "${ctx.task.title}"`,
    metadata: {
      taskId: ctx.task.id,
      agentRunId: run.id,
      workSessionId: ctx.workSessionId,
      prNumber: ctx.task.githubPrNumber,
      prUrl: ctx.task.githubPrUrl,
      status: result.status,
      recommendation: ctx.result.prReviewRecommendation ?? undefined,
    },
  });

  return { type: "continue" };
}

// ── run_session_checks ───────────────────────────────────────────────────────

export async function stageRunSessionChecks(ctx: StageContext): Promise<StageOutcome> {
  await logActivity({
    projectId: ctx.task.projectId,
    type: "work_session.checks.started",
    message: `Session checks started for task "${ctx.task.title}"`,
    metadata: { workSessionId: ctx.workSessionId, taskId: ctx.taskId, status: "running" },
  });

  let summary;
  try {
    summary = await runSessionChecks(ctx.workSessionId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown session checks error";
    ctx.result.checks = { status: "skipped", summary: `Session checks could not run: ${message}`, count: 0 };
    ctx.result.warnings?.push(`Session checks could not run: ${message}`);
    await logActivity({
      projectId: ctx.task.projectId,
      type: "work_session.checks.skipped",
      message: `Session checks skipped for task "${ctx.task.title}": ${message}`,
      metadata: { workSessionId: ctx.workSessionId, taskId: ctx.taskId, status: "skipped" },
    });
    return { type: "continue" };
  }

  ctx.result.checks = {
    status: summary.status,
    summary: summary.summary,
    count: summary.checks.length,
  };

  const details = summary.checks.map((c) => ({ name: c.name, status: c.status }));

  if (summary.status === "failed") {
    ctx.result.warnings?.push(summary.summary);
    await logActivity({
      projectId: ctx.task.projectId,
      type: "work_session.checks.completed_with_warnings",
      message: `Session checks completed with failures for task "${ctx.task.title}"`,
      metadata: { workSessionId: ctx.workSessionId, taskId: ctx.taskId, status: "failed", checks: details },
    });
  } else if (summary.status === "skipped") {
    await logActivity({
      projectId: ctx.task.projectId,
      type: "work_session.checks.skipped",
      message: `Session checks skipped for task "${ctx.task.title}"`,
      metadata: { workSessionId: ctx.workSessionId, taskId: ctx.taskId, status: "skipped", checks: details },
    });
  } else {
    await logActivity({
      projectId: ctx.task.projectId,
      type: "work_session.checks.completed",
      message: `Session checks completed for task "${ctx.task.title}"`,
      metadata: { workSessionId: ctx.workSessionId, taskId: ctx.taskId, status: "passed", checks: details },
    });
  }

  // Never revert, never block the whole session — continue to analyze_pr even
  // when a check failed. The orchestrator marks the session completed_with_warnings.
  return { type: "continue" };
}

// ── iteration stages ─────────────────────────────────────────────────────────

/**
 * reload_context: the orchestrator reloads the Task from the DB before this
 * runs, so this stage only confirms the task still exists. Logs the iteration
 * context so the Activity timeline reflects what was requested.
 */
export async function stageRefreshContext(ctx: StageContext): Promise<StageOutcome> {
  const task = await prisma.task.findUnique({ where: { id: ctx.taskId } });
  if (!task) {
    return { type: "failed", error: "The task no longer exists." };
  }
  if (ctx.requestedChanges) {
    await logActivity({
      projectId: ctx.task.projectId,
      type: "work_session.iteration_requested",
      message: `Iteration requested for task "${ctx.task.title}"`,
      metadata: {
        workSessionId: ctx.workSessionId,
        parentWorkSessionId: ctx.parentWorkSessionId,
        taskId: ctx.taskId,
        iterationNumber: ctx.iterationNumber,
        instruction: ctx.requestedChanges.slice(0, 200),
      },
    });
  }
  return { type: "continue" };
}

/**
 * ensure_existing_task: iteration never creates a new task — it must reuse the
 * existing one (and therefore its issue/branch/PR).
 */
export async function stageEnsureExistingTask(ctx: StageContext): Promise<StageOutcome> {
  if (!ctx.taskId) {
    return { type: "failed", error: "Iteration requires an existing task." };
  }
  return { type: "continue" };
}

/**
 * run_iteration_builder_proposal: same as the normal proposal stage, but with
 * the iteration context (fresh proposal driven by the new instruction).
 */
export async function stageRunIterationBuilderProposal(
  ctx: StageContext
): Promise<StageOutcome> {
  return stageEnsureBuilderProposal(ctx);
}

// ── helpers ──────────────────────────────────────────────────────────────────

export function buildHumanSummary(result: WorkSessionResult): string {
  const lines: string[] = ["Forge ha trabajado en esta idea.", "", "Resultado:"];
  lines.push(result.taskId ? "- Tarea creada/actualizada" : "- Tarea pendiente");
  lines.push(result.branchUrl ? "- Rama preparada" : "- Rama no creada");
  lines.push(result.prUrl ? "- PR creada" : "- PR no creada");
  lines.push(result.builderCommitUrl ? "- Cambios realizados en la rama" : "- Sin cambios funcionales");
  if (result.filesChanged && result.filesChanged.length > 0) {
    lines.push(`- Archivos modificados: ${result.filesChanged.join(", ")}`);
  }
  lines.push("- Revisión de PR generada");
  if (result.checks) {
    lines.push("");
    lines.push("Comprobaciones:");
    if (result.checks.status === "passed") {
      lines.push("- Checks: build OK, lint OK, prisma validate OK.");
    } else if (result.checks.status === "failed") {
      lines.push(`- Checks: fallaron. ${result.checks.summary ?? ""}`.trim());
    } else {
      lines.push("- Checks: omitidos (runner no configurado).");
    }
  }
  lines.push("");
  lines.push("Estado:");
  if (result.prReviewRecommendation === "ready_for_review") {
    lines.push("- Lista para revisión humana");
  } else if (result.prReviewRecommendation === "needs_human_decision") {
    lines.push("- Necesita decisión humana");
  } else if (result.prReviewRecommendation) {
    lines.push(`- Revisión: ${result.prReviewRecommendation}`);
  } else if (result.checks?.status === "failed") {
    lines.push("- Necesita revisión antes de continuar");
  } else {
    lines.push("- En progreso");
  }
  if (result.warnings && result.warnings.length > 0) {
    lines.push("");
    lines.push("Avisos:");
    result.warnings.forEach((w) => lines.push(`- ${w}`));
  }
  return lines.join("\n");
}

/**
 * Human summary for an iteration session. Clear, non-technical, focused on the
 * change the user requested and what Forge actually did with it.
 */
export function buildIterationSummary(
  result: WorkSessionResult,
  requestedChanges: string | null
): string {
  const lines: string[] = ["Forge ha aplicado una iteración sobre la tarea.", ""];
  lines.push("Cambio pedido:");
  lines.push(requestedChanges?.trim() || "Continuar desde el estado actual de la tarea.");
  lines.push("");
  lines.push("Resultado:");
  if (result.filesChanged && result.filesChanged.length > 0) {
    lines.push(`- Se actualizó ${result.filesChanged.join(", ")}.`);
  } else if (result.builderCommitUrl) {
    lines.push("- Se creó un nuevo commit en la misma rama.");
  } else {
    lines.push("- Sin cambios funcionales nuevos.");
  }
  lines.push("- Se creó un nuevo commit en la misma rama.");
  if (result.prUrl) lines.push("- La PR existente se actualizó.");
  if (result.prReviewRecommendation) {
    if (result.prReviewRecommendation === "ready_for_review") {
      lines.push("- La revisión automática lo considera listo para revisión.");
    } else if (result.prReviewRecommendation === "low" || result.prReviewRecommendation === "keep_draft") {
      lines.push("- La revisión automática considera el cambio de bajo riesgo.");
    } else {
      lines.push(`- La revisión automática recomienda: ${result.prReviewRecommendation}.`);
    }
  }
  if (result.checks) {
    lines.push("");
    lines.push("Comprobaciones:");
    if (result.checks.status === "passed") {
      lines.push("- Checks: build OK, lint OK, prisma validate OK.");
    } else if (result.checks.status === "failed") {
      lines.push(`- Checks: fallaron. ${result.checks.summary ?? ""}`.trim());
    } else {
      lines.push("- Checks: omitidos porque el runner todavía no está configurado.");
    }
  }
  lines.push("");
  lines.push("Estado:");
  lines.push("Listo para que lo revises.");
  if (result.warnings && result.warnings.length > 0) {
    lines.push("");
    lines.push("Avisos:");
    result.warnings.forEach((w) => lines.push(`- ${w}`));
  }
  return lines.join("\n");
}

export type PrismaJsonValue = Prisma.InputJsonValue;
