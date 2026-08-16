import { prisma } from "@/lib/db";
import { chatCompletion, getLLMConfig, isLLMConfigured } from "./client";
import { LLMError, PlannerOutput, plannerOutputSchema } from "./types";

export type PlannerRunResult =
  | {
      status: "completed";
      output: PlannerOutput;
      raw: string;
      model: string;
    }
  | {
      status: "completed_with_warnings";
      raw: string;
      model: string;
      warning: string;
    };

const SYSTEM_PROMPT = `You are "Planner", the planning agent of Forge Core01, an internal control plane for agent-assisted software development.

Your job is to turn a project and its instructions into a clear, actionable technical/product plan. You do NOT write code.

Always reply with a single valid JSON object — no markdown fences, no extra text — matching this exact schema:

{
  "summary": "string",
  "recommended_next_phase": "string",
  "objectives": ["string"],
  "proposed_tasks": [
    {
      "title": "string",
      "description": "string",
      "priority": "high" | "medium" | "low",
      "type": "product" | "frontend" | "backend" | "infra" | "qa" | "docs"
    }
  ],
  "risks": ["string"],
  "questions": ["string"],
  "acceptance_criteria": ["string"]
}`;

function formatList(items: string[] | undefined | null): string {
  if (!items || items.length === 0) return "(none)";
  return items.map((item) => `- ${item}`).join("\n");
}

function buildUserPrompt(project: {
  name: string;
  slug: string;
  description: string | null;
  status: string;
  devUrl: string | null;
  productionUrl: string | null;
  repoUrl: string | null;
  targetDevDomain: string | null;
  preferredStack: string | null;
  repositoryFullName: string | null;
  notes: string | null;
  instructions: { content: string; status: string }[];
  activityLogs: { type: string; message: string }[];
}): string {
  const lines: string[] = [];

  lines.push(`Project: ${project.name} (slug: ${project.slug})`);
  lines.push(`Status: ${project.status}`);
  if (project.description) lines.push(`Description: ${project.description}`);
  if (project.devUrl) lines.push(`DEV URL: ${project.devUrl}`);
  if (project.productionUrl)
    lines.push(`Production URL: ${project.productionUrl}`);
  if (project.repoUrl) lines.push(`Repo: ${project.repoUrl}`);
  if (project.targetDevDomain)
    lines.push(`Target DEV domain: ${project.targetDevDomain}`);
  if (project.preferredStack)
    lines.push(`Preferred stack: ${project.preferredStack}`);
  if (project.repositoryFullName)
    lines.push(`Repository full name: ${project.repositoryFullName}`);
  if (project.notes) lines.push(`Notes: ${project.notes}`);

  lines.push("");
  lines.push("Instructions:");
  lines.push(
    project.instructions.length > 0
      ? project.instructions
          .map((i) => `- [${i.status}] ${i.content}`)
          .join("\n")
      : "(none)"
  );

  lines.push("");
  lines.push("Recent activity:");
  lines.push(
    project.activityLogs.length > 0
      ? project.activityLogs
          .map((a) => `- ${a.type}: ${a.message}`)
          .join("\n")
      : "(none)"
  );

  lines.push("");
  lines.push(
    "Based on the above, produce the plan. Return ONLY the JSON object, nothing else."
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

export async function runPlannerAgent(
  projectId: string
): Promise<PlannerRunResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      instructions: { orderBy: { createdAt: "desc" }, take: 10 },
      activityLogs: { orderBy: { createdAt: "desc" }, take: 15 },
    },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  if (!isLLMConfigured()) {
    throw new LLMError("LLM provider is not configured", "not_configured");
  }

  const config = getLLMConfig();
  const userPrompt = buildUserPrompt(project);

  const result = await chatCompletion({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
  });

  try {
    const json = JSON.parse(extractJson(result.content));
    const output = plannerOutputSchema.parse(json);
    return { status: "completed", output, raw: result.content, model: result.model };
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
