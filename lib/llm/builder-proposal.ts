import { z } from "zod";
import { chatCompletion, getLLMConfig, isLLMConfigured } from "./client";
import { LLMError } from "./types";
import {
  BuilderProposalContext,
  BuilderContextOptions,
  buildBuilderProposalContext,
} from "./builder-context";

// ── Output schema ────────────────────────────────────────────────────────────

export const builderProposalOutputSchema = z.object({
  summary: z.string(),
  understanding: z.string(),
  recommended_approach: z.string(),
  files_to_inspect: z.array(
    z.object({
      path: z.string(),
      reason: z.string(),
    })
  ),
  files_likely_to_modify: z.array(
    z.object({
      path: z.string(),
      reason: z.string(),
      change_type: z.enum(["create", "update", "delete", "unknown"]),
    })
  ),
  implementation_steps: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      risk: z.enum(["low", "medium", "high"]),
    })
  ),
  validation_commands: z
    .array(
      z.object({
        command: z.string(),
        purpose: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .transform((commands) =>
      commands.map((c) => ({
        command: c.command,
        purpose: (c.purpose ?? c.description ?? "").trim(),
      }))
    ),
  risks: z.array(z.string()),
  questions: z.array(z.string()),
  acceptance_criteria: z.array(z.string()),
  estimated_complexity: z.enum(["low", "medium", "high"]),
  safe_to_attempt_next: z.boolean(),
});

export type BuilderProposalOutput = z.infer<
  typeof builderProposalOutputSchema
>;

export type BuilderProposalRunResult =
  | {
      status: "completed";
      output: BuilderProposalOutput;
      raw: string;
      model: string;
    }
  | {
      status: "completed_with_warnings";
      raw: string;
      model: string;
      warning: string;
    };

// ── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are "Builder", the implementation proposal agent of Forge Core01, an internal control plane for agent-assisted software development.

Your job is to ANALYZE a task and propose an implementation strategy. You do NOT write code, you do NOT create commits, you do NOT modify files, and you do NOT open pull requests. You only analyze and propose.

Rules:
- Be concrete and specific.
- Use ONLY the context provided below. Do not invent files that are not mentioned in the context.
- You may propose files that probably exist or should be modified, but mark them clearly as assumptions/probable.
- Distinguish facts from assumptions.
- If you are unsure or important data is missing, set "safe_to_attempt_next" to false and fill "questions".
- Do not propose reading or creating secrets, .env files, or credentials.

Always reply with a single valid JSON object — no markdown fences, no extra text — matching this exact schema:

{
  "summary": "string",
  "understanding": "string",
  "recommended_approach": "string",
  "files_to_inspect": [
    { "path": "string", "reason": "string" }
  ],
  "files_likely_to_modify": [
    { "path": "string", "reason": "string", "change_type": "create" | "update" | "delete" | "unknown" }
  ],
  "implementation_steps": [
    { "title": "string", "description": "string", "risk": "low" | "medium" | "high" }
  ],
  "validation_commands": [
    { "command": "string", "purpose": "string" }
  ],
  "risks": ["string"],
  "questions": ["string"],
  "acceptance_criteria": ["string"],
  "estimated_complexity": "low" | "medium" | "high",
  "safe_to_attempt_next": true
}

In "validation_commands" always use the key "purpose" (never "description") for each command's explanation.`;

function formatContext(ctx: BuilderProposalContext): string {
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
  if (ctx.taskDescription)
    lines.push(`Description: ${ctx.taskDescription}`);
  if (ctx.taskNotes) lines.push(`Notes: ${ctx.taskNotes}`);
  if (ctx.githubIssueNumber)
    lines.push(`Issue: #${ctx.githubIssueNumber} (${ctx.githubIssueUrl})`);
  if (ctx.githubBranchName) lines.push(`Branch: ${ctx.githubBranchName}`);
  if (ctx.githubPlanPath)
    lines.push(`Plan file: ${ctx.githubPlanPath}`);
  if (ctx.githubPlanCommitUrl)
    lines.push(`Plan commit: ${ctx.githubPlanCommitUrl}`);
  if (ctx.githubPrNumber)
    lines.push(`Draft PR: #${ctx.githubPrNumber} (${ctx.githubPrUrl})`);

  lines.push("");
  lines.push("## GitHub context");
  if (ctx.githubContextWarning) {
    lines.push(`Warning: ${ctx.githubContextWarning}`);
  }
  const gctx = ctx.githubContext;
  if (gctx) {
    lines.push("Root entries:");
    lines.push(
      gctx.rootEntries.length > 0
        ? gctx.rootEntries.map((e) => `- ${e}`).join("\n")
        : "- (none)"
    );
    if (gctx.appLibListings.length > 0) {
      lines.push("app/lib/src/components paths:");
      lines.push(gctx.appLibListings.map((p) => `- ${p}`).join("\n"));
    }
    for (const f of gctx.files) {
      lines.push("");
      lines.push(`File: ${f.path}`);
      lines.push("```");
      lines.push(f.content);
      lines.push("```");
    }
    for (const w of gctx.warnings) {
      lines.push(`Context warning: ${w}`);
    }
  } else if (!ctx.githubContextWarning) {
    lines.push("- (no repo context)");
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
      "IMPORTANT: Reuse the existing task, branch and pull request. Do NOT propose creating a new task, new branch or new PR. Propose the minimal delta from the current state."
    );
  } else {
    lines.push("This is the initial proposal for this task (not an iteration).");
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
    "Based ONLY on the above, produce the Builder proposal. Return ONLY the JSON object, nothing else."
  );

  return lines.join("\n");
}

function extractJson(text: string): string {
  let t = text.trim();

  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();

  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return t.slice(start, end + 1);
  }

  return t;
}

// ── Agent ───────────────────────────────────────────────────────────────────

export async function runBuilderProposalAgent(
  taskId: string,
  options?: BuilderContextOptions
): Promise<BuilderProposalRunResult> {
  if (!isLLMConfigured()) {
    throw new LLMError("LLM provider is not configured", "not_configured");
  }

  const context = await buildBuilderProposalContext(taskId, options);
  const config = getLLMConfig();

  const result = await chatCompletion({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: formatContext(context) },
    ],
    temperature: 0.2,
  });

  try {
    const json = JSON.parse(extractJson(result.content));
    const output = builderProposalOutputSchema.parse(json);
    return {
      status: "completed",
      output,
      raw: result.content,
      model: result.model,
    };
  } catch {
    return {
      status: "completed_with_warnings",
      raw: result.content,
      model: result.model,
      warning:
        "The model returned text that could not be parsed as the expected JSON schema. Raw output has been preserved.",
    };
  }
}

/**
 * Best-effort parse of a stored builder proposal output (for UI rendering).
 * Returns null when the raw output is missing or not parseable.
 */
export function parseBuilderProposalOutput(
  raw: string | null | undefined
): BuilderProposalOutput | null {
  if (!raw) return null;
  try {
    return builderProposalOutputSchema.parse(JSON.parse(extractJson(raw)));
  } catch {
    return null;
  }
}
