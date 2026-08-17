import { z } from "zod";
import { prisma } from "@/lib/db";
import { chatCompletion, getLLMConfig, isLLMConfigured } from "./client";
import { LLMError } from "./types";
import { parseBuilderProposalOutput } from "./builder-proposal";
import {
  buildPrReviewGitHubContext,
  PrReviewGitHubContext,
} from "@/lib/github/pr-context";
import { parseBuilderCommitOutput } from "./builder-commit-output";

// ── Output schema ────────────────────────────────────────────────────────────

export const prReviewOutputSchema = z.object({
  summary: z.string(),
  change_overview: z.string(),
  files_changed: z.array(
    z.object({
      path: z.string(),
      change_type: z.enum(["create", "update", "delete", "unknown"]),
      summary: z.string(),
      risk: z.enum(["low", "medium", "high"]),
    })
  ),
  safety_assessment: z.object({
    touches_blocked_paths: z.boolean(),
    touches_secrets: z.boolean(),
    touches_infra: z.boolean(),
    touches_tests: z.boolean(),
    touches_runtime_code: z.boolean(),
    notes: z.array(z.string()),
  }),
  review_findings: z.array(
    z.object({
      severity: z.enum(["info", "warning", "blocking"]),
      title: z.string(),
      description: z.string(),
      file: z.string().nullable(),
    })
  ),
  recommended_checks: z.array(
    z.object({
      command: z.string(),
      purpose: z.string(),
    })
  ),
  risk_level: z.enum(["low", "medium", "high"]),
  recommendation: z.enum([
    "ready_for_review",
    "keep_draft",
    "needs_changes",
    "needs_human_decision",
  ]),
  ready_for_review: z.boolean(),
  human_notes: z.array(z.string()),
});

export type PrReviewOutput = z.infer<typeof prReviewOutputSchema>;

export type PrReviewRunResult =
  | {
      status: "completed";
      output: PrReviewOutput;
      raw: string;
      model: string;
    }
  | {
      status: "completed_with_warnings";
      reason: string;
      raw: string;
      model: string;
    };

// ── Context ─────────────────────────────────────────────────────────────────

export interface PrReviewContext {
  taskId: string;
  taskTitle: string;
  taskDescription: string | null;
  taskType: string;
  taskStatus: string;
  projectName: string | null;
  repositoryFullName: string | null;
  githubBranchName: string | null;
  githubPrNumber: number | null;
  githubBuilderCommitSha: string | null;
  builderProposalSummary: string | null;
  builderCommitSummary: string | null;
  github: PrReviewGitHubContext | null;
  githubWarning: string | null;
  activityLogs: { type: string; message: string; createdAt: Date }[];
  recentAgentRuns: { agentName: string | null; model: string | null; status: string; createdAt: Date }[];
}

export async function buildPrReviewContext(
  taskId: string
): Promise<PrReviewContext> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: {
        include: {
          activityLogs: { orderBy: { createdAt: "desc" }, take: 15 },
        },
      },
      agentRuns: { orderBy: { createdAt: "desc" }, take: 8 },
    },
  });

  if (!task) throw new Error("Task not found");
  const project = task.project;

  const proposalRun = task.agentRuns.find(
    (run) => run.agentName === "builder-proposal" && run.status === "completed"
  );
  const proposal = proposalRun
    ? parseBuilderProposalOutput(proposalRun.output)
    : null;

  const commitRun = task.agentRuns.find(
    (run) => run.agentName === "builder-commit" && run.status === "completed"
  );
  const commitOutput = commitRun
    ? parseBuilderCommitOutput(commitRun.output)
    : null;

  let github: PrReviewGitHubContext | null = null;
  let githubWarning: string | null = null;
  if (project?.repositoryFullName && task.githubPrNumber) {
    try {
      github = await buildPrReviewGitHubContext({
        repositoryFullName: project.repositoryFullName,
        prNumber: task.githubPrNumber,
      });
    } catch (error) {
      github = null;
      githubWarning =
        error instanceof Error
          ? error.message
          : "Could not load the pull request context from GitHub";
    }
  } else {
    githubWarning =
      "Task has no linked pull request or repository — GitHub context unavailable.";
  }

  return {
    taskId: task.id,
    taskTitle: task.title,
    taskDescription: task.description,
    taskType: task.type,
    taskStatus: task.status,
    projectName: project?.name ?? null,
    repositoryFullName: project?.repositoryFullName ?? null,
    githubBranchName: task.githubBranchName,
    githubPrNumber: task.githubPrNumber,
    githubBuilderCommitSha: task.githubBuilderCommitSha,
    builderProposalSummary: proposal?.summary ?? null,
    builderCommitSummary: commitOutput?.summary ?? null,
    github,
    githubWarning,
    activityLogs: (project?.activityLogs ?? []).map((a) => ({
      type: a.type,
      message: a.message,
      createdAt: a.createdAt,
    })),
    recentAgentRuns: task.agentRuns.map((run) => ({
      agentName: run.agentName,
      model: run.model,
      status: run.status,
      createdAt: run.createdAt,
    })),
  };
}

// ── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a conservative technical reviewer for Forge Core01, an internal control plane for agent-assisted software development.

You review a single pull request and give a recommendation. You NEVER merge, you NEVER deploy, you NEVER auto-approve, and you NEVER request reviewers. You only analyze and recommend.

Rules:
- Distinguish facts from assumptions.
- Return ONLY a single valid JSON object — no markdown fences, no extra text.
- Be conservative. If anything is unclear, choose a safer recommendation.
- If the PR touches blocked/sensitive/infra/workflow paths, set ready_for_review=false.
- If there are "blocking" findings, set ready_for_review=false.
- If the PR has no sufficient functional changes, recommend "keep_draft" or "needs_changes".
- If you do not have enough context, recommend "needs_human_decision".
- Do not invent findings. Base everything on the provided diff and context.

Output schema:
{
  "summary": "string",
  "change_overview": "string",
  "files_changed": [
    { "path": "string", "change_type": "create" | "update" | "delete" | "unknown", "summary": "string", "risk": "low" | "medium" | "high" }
  ],
  "safety_assessment": {
    "touches_blocked_paths": false,
    "touches_secrets": false,
    "touches_infra": false,
    "touches_tests": false,
    "touches_runtime_code": true,
    "notes": ["string"]
  },
  "review_findings": [
    { "severity": "info" | "warning" | "blocking", "title": "string", "description": "string", "file": "string" | null }
  ],
  "recommended_checks": [
    { "command": "string", "purpose": "string" }
  ],
  "risk_level": "low" | "medium" | "high",
  "recommendation": "ready_for_review" | "keep_draft" | "needs_changes" | "needs_human_decision",
  "ready_for_review": true,
  "human_notes": ["string"]
}`;

function formatReviewContext(ctx: PrReviewContext): string {
  const lines: string[] = [];

  lines.push("## Project context");
  lines.push(`Project: ${ctx.projectName ?? "—"}`);
  lines.push(`Repository: ${ctx.repositoryFullName ?? "Not linked"}`);

  lines.push("");
  lines.push("## Task context");
  lines.push(`Task ID: ${ctx.taskId}`);
  lines.push(`Title: ${ctx.taskTitle}`);
  lines.push(`Type: ${ctx.taskType}`);
  lines.push(`Status: ${ctx.taskStatus}`);
  if (ctx.taskDescription) lines.push(`Description: ${ctx.taskDescription}`);
  if (ctx.githubBranchName) lines.push(`Branch: ${ctx.githubBranchName}`);
  if (ctx.githubPrNumber)
    lines.push(`PR: #${ctx.githubPrNumber}`);
  if (ctx.githubBuilderCommitSha)
    lines.push(`Builder commit: ${ctx.githubBuilderCommitSha}`);
  if (ctx.builderProposalSummary)
    lines.push(`Builder proposal summary: ${ctx.builderProposalSummary}`);
  if (ctx.builderCommitSummary)
    lines.push(`Builder commit summary: ${ctx.builderCommitSummary}`);

  lines.push("");
  lines.push("## Pull request context (from GitHub)");
  if (ctx.githubWarning) lines.push(`Warning: ${ctx.githubWarning}`);
  const g = ctx.github;
  if (g) {
    lines.push(`PR #${g.pr.number}: "${g.pr.title}"`);
    lines.push(`State: ${g.pr.state} | Draft: ${g.pr.draft ? "Yes" : "No"} | Merged: ${g.pr.merged_at ? "Yes" : "No"}`);
    lines.push(`Base: ${g.pr.baseBranch} → Head: ${g.pr.headBranch}`);
    lines.push(`Total changes: ${g.totalChanges}`);
    if (g.assessment.touchesBlockedPaths) {
      lines.push(`SAFETY: PR touches blocked paths: ${g.assessment.blockedPaths.join(", ")}`);
    }
    for (const w of g.warnings) lines.push(`Warning: ${w}`);
    lines.push("Commits:");
    g.commits.forEach((c) =>
      lines.push(`- ${c.sha.slice(0, 7)} ${c.message.split("\n")[0].slice(0, 120)}`)
    );
    lines.push("");
    lines.push("Changed files (with diff):");
    for (const f of g.changedFiles) {
      lines.push("");
      lines.push(`File: ${f.filename} (${f.status}, +${f.additions} -${f.deletions})`);
      if (f.patch) {
        lines.push("```diff");
        lines.push(f.patch);
        lines.push("```");
      } else {
        lines.push("(no diff available)");
      }
    }
  }

  lines.push("");
  lines.push("## Recent activity");
  lines.push(
    ctx.activityLogs.length > 0
      ? ctx.activityLogs
          .map((a) => `- ${a.type}: ${a.message} (${a.createdAt.toISOString()})`)
          .join("\n")
      : "- (none)"
  );

  lines.push("");
  lines.push("## Recent agent runs");
  lines.push(
    ctx.recentAgentRuns.length > 0
      ? ctx.recentAgentRuns
          .map(
            (r) =>
              `- ${r.agentName ?? "?"} (${r.model ?? "?"}): ${r.status} @ ${r.createdAt.toISOString()}`
          )
          .join("\n")
      : "- (none)"
  );

  lines.push("");
  lines.push(
    "Based ONLY on the above, produce the PR review. Return ONLY the JSON object."
  );

  return lines.join("\n");
}

function extractJson(text: string): string {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end > start) return t.slice(start, end + 1);
  return t;
}

// ── Agent ───────────────────────────────────────────────────────────────────

export async function runPrReviewAgent(
  taskId: string
): Promise<PrReviewRunResult> {
  if (!isLLMConfigured()) {
    throw new LLMError("LLM provider is not configured", "not_configured");
  }

  const context = await buildPrReviewContext(taskId);
  const config = getLLMConfig();

  const result = await chatCompletion({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: formatReviewContext(context) },
    ],
    temperature: 0.1,
    responseFormat: "json_object",
  });

  try {
    const output = prReviewOutputSchema.parse(
      JSON.parse(extractJson(result.content))
    );
    return {
      status: "completed",
      output,
      raw: result.content,
      model: result.model,
    };
  } catch {
    return {
      status: "completed_with_warnings",
      reason:
        "The model did not return valid JSON matching the PR review schema. Raw output preserved.",
      raw: result.content,
      model: result.model,
    };
  }
}

/**
 * Best-effort parse of a stored PR review output (for UI rendering).
 */
export function parsePrReviewOutput(
  raw: string | null | undefined
): PrReviewOutput | null {
  if (!raw) return null;
  try {
    return prReviewOutputSchema.parse(JSON.parse(extractJson(raw)));
  } catch {
    return null;
  }
}
