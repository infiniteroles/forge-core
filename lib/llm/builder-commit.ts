import { z } from "zod";
import { applySkill } from "@/lib/agents/skills";
import { prisma } from "@/lib/db";
import { chatCompletion, getLLMConfig, isLLMConfigured } from "./client";
import { LLMError } from "./types";
import { parseBuilderProposalOutput } from "./builder-proposal";
import { readRepoFiles, RepoContextFile } from "@/lib/github/context";
import {
  buildIterationContext,
  BuilderContextOptions,
} from "./builder-context";
import {
  CommitFileChange,
  validateBuilderCommitChanges,
} from "@/lib/github/safe-file-policy";

// ── Output schema ────────────────────────────────────────────────────────────

export const builderCommitOutputSchema = z.object({
  summary: z.string(),
  implementation_notes: z.string(),
  files: z.array(
    z.object({
      path: z.string(),
      operation: z.enum(["create", "update"]),
      reason: z.string(),
      content: z.string(),
    })
  ),
  validation_plan: z.array(
    z.object({
      command: z.string(),
      purpose: z.string(),
    })
  ),
  risks: z.array(z.string()),
  post_commit_notes: z.array(z.string()),
  safe_to_commit: z.boolean(),
});

export type BuilderCommitOutput = z.infer<typeof builderCommitOutputSchema>;

export type BuilderCommitRunResult =
  | {
      status: "completed";
      changes: BuilderCommitOutput;
      raw: string;
      model: string;
      selectedPaths: string[];
      usage?: { promptTokens?: number; completionTokens?: number };
    }
  | {
      status: "completed_with_warnings";
      reason: string;
      raw: string | null;
      model: string | null;
      violations?: string[];
      usage?: { promptTokens?: number; completionTokens?: number };
    };

// ── Context ─────────────────────────────────────────────────────────────────

export interface BuilderProposalRef {
  summary: string;
  recommended_approach: string;
  files_to_inspect: { path: string; reason: string }[];
  files_likely_to_modify: {
    path: string;
    reason: string;
    change_type: string;
  }[];
  estimated_complexity: string;
  safe_to_attempt_next: boolean;
}

export interface BuilderCommitContext {
  taskId: string;
  taskTitle: string;
  taskDescription: string | null;
  taskType: string;
  taskPriority: string;
  taskStatus: string;
  taskAssignedAgent: string | null;
  taskNotes: string | null;
  projectName: string | null;
  repositoryFullName: string | null;
  repositoryDefaultBranch: string | null;
  githubBranchName: string | null;
  githubPrNumber: number | null;
  githubPrUrl: string | null;
  githubPlanPath: string | null;
  githubPlanCommitUrl: string | null;
  proposal: BuilderProposalRef | null;
  proposalWarning: string | null;
  fileContents: RepoContextFile[];
  readWarnings: string[];
  activityLogs: { type: string; message: string; createdAt: Date }[];
  recentAgentRuns: { agentName: string | null; model: string | null; status: string; createdAt: Date }[];
  isIteration: boolean;
  requestedChanges: string | null;
  iterationNumber: number;
  previousWorkSessions: {
    id: string;
    mode: string;
    status: string;
    summary: string | null;
    requestedChanges: string | null;
    iterationNumber: number;
    createdAt: Date;
  }[];
  lastReviewSummary: string | null;
  lastBuilderCommitSummary: string | null;
}

export async function buildBuilderCommitContext(
  taskId: string,
  options: BuilderContextOptions = {}
): Promise<BuilderCommitContext> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: {
        include: {
          activityLogs: { orderBy: { createdAt: "desc" }, take: 15 },
        },
      },
      agentRuns: { orderBy: { createdAt: "desc" }, take: 6 },
    },
  });

  if (!task) throw new Error("Task not found");
  const project = task.project;

  // Latest completed Builder Proposal for this task.
  const proposalRun = task.agentRuns.find(
    (run) => run.agentName === "builder-proposal" && run.status === "completed"
  );
  let proposal: BuilderProposalRef | null = null;
  let proposalWarning: string | null = null;
  if (proposalRun) {
    const parsed = parseBuilderProposalOutput(proposalRun.output);
    if (parsed) {
      proposal = {
        summary: parsed.summary,
        recommended_approach: parsed.recommended_approach,
        files_to_inspect: parsed.files_to_inspect,
        files_likely_to_modify: parsed.files_likely_to_modify.map((f) => ({
          path: f.path,
          reason: f.reason,
          change_type: f.change_type,
        })),
        estimated_complexity: parsed.estimated_complexity,
        safe_to_attempt_next: parsed.safe_to_attempt_next,
      };
    } else {
      proposalWarning =
        "Builder Proposal exists but its output could not be parsed.";
    }
  } else {
    proposalWarning = "No completed Builder Proposal found for this task.";
  }

  // Read the files the proposal wants to inspect/modify (limited, read-only).
  let selectedPaths: string[] = [];
  if (proposal) {
    selectedPaths = [
      ...proposal.files_to_inspect.map((f) => f.path),
      ...proposal.files_likely_to_modify.map((f) => f.path),
    ].filter(Boolean);
  }
  if (selectedPaths.length === 0) {
    selectedPaths = ["README.md", "package.json"];
  }

  let fileContents: RepoContextFile[] = [];
  let readWarnings: string[] = [];
  if (project?.repositoryFullName && task.githubBranchName) {
    try {
      const read = await readRepoFiles({
        repositoryFullName: project.repositoryFullName,
        branchName: task.githubBranchName,
        paths: selectedPaths,
      });
      fileContents = read.files;
      readWarnings = read.warnings;
    } catch (error) {
      readWarnings = [
        error instanceof Error
          ? error.message
          : "Could not read selected repository files",
      ];
    }
  } else {
    readWarnings.push(
      "No repository/branch linked — cannot read file contents."
    );
  }

  const iteration = await buildIterationContext(taskId, options);

  return {
    taskId: task.id,
    taskTitle: task.title,
    taskDescription: task.description,
    taskType: task.type,
    taskPriority: task.priority,
    taskStatus: task.status,
    taskAssignedAgent: task.assignedAgent,
    taskNotes: task.notes,
    projectName: project?.name ?? null,
    repositoryFullName: project?.repositoryFullName ?? null,
    repositoryDefaultBranch: project?.repositoryDefaultBranch ?? null,
    githubBranchName: task.githubBranchName,
    githubPrNumber: task.githubPrNumber,
    githubPrUrl: task.githubPrUrl,
    githubPlanPath: task.githubPlanPath,
    githubPlanCommitUrl: task.githubPlanCommitUrl,
    proposal,
    proposalWarning,
    fileContents,
    readWarnings,
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
    ...iteration,
  };
}

// ── Prompt ──────────────────────────────────────────────────────────────────

const SAFETY_RULES = [
  "You propose REAL file changes for the task branch ONLY.",
  "Return ONLY a single valid JSON object — no markdown fences, no extra text.",
  "NEVER delete files. operation is only 'create' or 'update'.",
  "NEVER touch secrets, .env, .credentials, keys, certificates or binary files.",
  "NEVER touch main, deployment, firewall, SSH, VPS infra, Dockerfile, docker-compose, nginx, caddy, .github/workflows or prisma/migrations.",
  "NEVER invent files that do not exist or were not provided in the context.",
  "Only modify files that are strictly necessary for the task.",
  "Keep changes small and focused. Max 5 files per run.",
  "If you do not have enough context, set safe_to_commit to false.",
  "Use ONLY the file contents provided below. Facts vs assumptions must be clear.",
  "Do NOT include sensitive data (tokens, passwords, API keys) in any content.",
].join("\n");

const SYSTEM_PROMPT = `You are "Builder Commit", the controlled code-change agent of Forge Core01, an internal control plane for agent-assisted software development.

You propose CONCRETE, LIMITED file changes for a single task, on its associated GitHub branch only. You never touch main, never merge, never deploy, and never modify infrastructure.

SAFETY RULES:
${SAFETY_RULES}

Always reply with a single valid JSON object matching this exact schema:

{
  "summary": "string",
  "implementation_notes": "string",
  "files": [
    {
      "path": "string",
      "operation": "create" | "update",
      "reason": "string",
      "content": "string"
    }
  ],
  "validation_plan": [
    { "command": "string", "purpose": "string" }
  ],
  "risks": ["string"],
  "post_commit_notes": ["string"],
  "safe_to_commit": true
}

- operation MUST be "create" or "update". Never "delete".
- Do not use absolute paths or "..".
- Do not propose changes to blocked paths (secrets, infra, workflows, migrations, Dockerfile, docker-compose, nginx, caddy, scripts/deploy*, scripts/ssh*).
- Each "content" must be the FULL new file content (for "update" include the complete file, not a diff).
- If unsure, set "safe_to_commit" to false.`;

function formatCommitContext(ctx: BuilderCommitContext): string {
  const lines: string[] = [];

  lines.push("## Project context");
  lines.push(`Project: ${ctx.projectName ?? "—"}`);
  lines.push(`Repository: ${ctx.repositoryFullName ?? "Not linked"}`);
  if (ctx.repositoryDefaultBranch)
    lines.push(`Default branch: ${ctx.repositoryDefaultBranch}`);

  lines.push("");
  lines.push("## Task context");
  lines.push(`Task ID: ${ctx.taskId}`);
  lines.push(`Title: ${ctx.taskTitle}`);
  lines.push(`Type: ${ctx.taskType}`);
  lines.push(`Priority: ${ctx.taskPriority}`);
  lines.push(`Status: ${ctx.taskStatus}`);
  lines.push(`Assigned agent: ${ctx.taskAssignedAgent ?? "Not assigned"}`);
  if (ctx.taskDescription) lines.push(`Description: ${ctx.taskDescription}`);
  if (ctx.taskNotes) lines.push(`Notes: ${ctx.taskNotes}`);
  if (ctx.githubBranchName) lines.push(`Branch: ${ctx.githubBranchName}`);
  if (ctx.githubPrNumber)
    lines.push(`Draft PR: #${ctx.githubPrNumber} (${ctx.githubPrUrl})`);
  if (ctx.githubPlanPath) lines.push(`Plan file: ${ctx.githubPlanPath}`);
  if (ctx.githubPlanCommitUrl)
    lines.push(`Plan commit: ${ctx.githubPlanCommitUrl}`);

  lines.push("");
  lines.push("## Builder Proposal");
  if (ctx.proposalWarning) lines.push(`Warning: ${ctx.proposalWarning}`);
  if (ctx.proposal) {
    lines.push(`Summary: ${ctx.proposal.summary}`);
    lines.push(`Recommended approach: ${ctx.proposal.recommended_approach}`);
    lines.push(`Estimated complexity: ${ctx.proposal.estimated_complexity}`);
    lines.push(`Safe to attempt next: ${ctx.proposal.safe_to_attempt_next ? "Yes" : "No"}`);
    lines.push("Files to inspect:");
    ctx.proposal.files_to_inspect.forEach((f) =>
      lines.push(`- ${f.path}: ${f.reason}`)
    );
    lines.push("Files likely to modify:");
    ctx.proposal.files_likely_to_modify.forEach((f) =>
      lines.push(`- ${f.path} (${f.change_type}): ${f.reason}`)
    );
  }

  lines.push("");
  lines.push("## Iteration request");
  if (ctx.isIteration) {
    lines.push(
      `This is an ITERATION (iteration #${ctx.iterationNumber}) on an existing task.`
    );
    lines.push(
      `The user's NEW instruction takes priority over the original task and any previous plan:`
    );
    lines.push(ctx.requestedChanges?.trim() || "(no explicit instruction)");
    lines.push("");
    lines.push(
      "IMPORTANT: Reuse the existing task, branch and pull request. Do NOT create a new task, new branch or new PR. Read the CURRENT file content from the branch and apply ONLY the requested delta — keep changes small and scoped. Do not rewrite unrelated parts of the file."
    );
  } else {
    lines.push("This is the initial commit for this task (not an iteration).");
  }
  if (ctx.previousWorkSessions.length > 0) {
    lines.push("");
    lines.push("Previous work sessions on this task:");
    ctx.previousWorkSessions.forEach((s) => {
      lines.push(
        `- #${s.iterationNumber} ${s.mode} [${s.status}] (${s.createdAt.toISOString()}): ${
          s.summary ? s.summary.replace(/\n/g, " ").slice(0, 180) : "no summary"
        }`
      );
    });
  }
  if (ctx.lastBuilderCommitSummary) {
    lines.push("");
    lines.push(`Last Builder Commit summary: ${ctx.lastBuilderCommitSummary.slice(0, 300)}`);
  }
  if (ctx.lastReviewSummary) {
    lines.push("");
    lines.push(`Last PR review summary: ${ctx.lastReviewSummary.slice(0, 300)}`);
  }

  lines.push("");
  lines.push("## Selected file contents (from the task branch)");
  if (ctx.readWarnings.length > 0) {
    ctx.readWarnings.forEach((w) => lines.push(`Warning: ${w}`));
  }
  if (ctx.fileContents.length === 0) {
    lines.push("- (no file contents available)");
  }
  for (const f of ctx.fileContents) {
    lines.push("");
    lines.push(`File: ${f.path}`);
    lines.push("```");
    lines.push(f.content);
    lines.push("```");
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
    "Based ONLY on the above, produce the Builder Commit proposal. Return ONLY the JSON object."
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

/**
 * Generates validated Builder Commit changes for a task. Does NOT write to
 * GitHub. Requires an existing task (safety requirements such as branch/PR/
 * completed proposal are validated by the caller/endpoint).
 */
export async function generateBuilderCommitChanges(
  taskId: string,
  options?: BuilderContextOptions
): Promise<BuilderCommitRunResult> {
  if (!isLLMConfigured()) {
    throw new LLMError("LLM provider is not configured", "not_configured");
  }

  const context = await buildBuilderCommitContext(taskId, options);
  const config = getLLMConfig();

  const result = await chatCompletion({
    messages: [
      { role: "system", content: applySkill("dev", SYSTEM_PROMPT) },
      { role: "user", content: formatCommitContext(context) },
    ],
    temperature: 0.1,
    responseFormat: "json_object",
  });

  let parsed: BuilderCommitOutput;
  try {
    parsed = builderCommitOutputSchema.parse(JSON.parse(extractJson(result.content)));
  } catch {
    return {
      status: "completed_with_warnings",
      reason:
        "The model did not return valid JSON matching the Builder Commit schema. No changes were applied.",
      raw: result.content,
      model: result.model,
      usage: result.usage,
    };
  }

  if (parsed.safe_to_commit !== true) {
    return {
      status: "completed_with_warnings",
      reason:
        "The Builder Commit model set safe_to_commit=false. No changes were applied.",
      raw: result.content,
      model: result.model,
      violations: ["safe_to_commit is false"],
      usage: result.usage,
    };
  }

  // Convert to policy format and validate.
  const changes: CommitFileChange[] = parsed.files.map((f) => ({
    path: f.path,
    operation: f.operation,
    content: f.content,
  }));
  const validation = validateBuilderCommitChanges(changes);

  if (!validation.ok) {
    return {
      status: "completed_with_warnings",
      reason:
        "The proposed changes violate the safe-file policy. No changes were applied.",
      raw: result.content,
      model: result.model,
      violations: validation.violations,
      usage: result.usage,
    };
  }

  return {
    status: "completed",
    changes: parsed,
    raw: result.content,
    model: result.model,
    selectedPaths: context.fileContents.map((f) => f.path),
    usage: result.usage,
  };
}
