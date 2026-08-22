import { prisma } from "@/lib/db";
import { getLimitedRepositoryContext } from "@/lib/github/context";
import { getContextBudget } from "@/lib/llm-efficiency/context-budget";
import {
  compactActivity,
  compactLine,
} from "@/lib/llm/prompts/compact-context";

export interface BuilderContextLog {
  type: string;
  message: string;
  createdAt: Date;
}

export interface BuilderContextRun {
  agentName: string | null;
  model: string | null;
  status: string;
  createdAt: Date;
  finishedAt: Date | null;
}

export interface BuilderIterationContext {
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

export interface BuilderProposalContext extends BuilderIterationContext {
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
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  githubBranchName: string | null;
  githubPlanPath: string | null;
  githubPlanCommitUrl: string | null;
  githubPrNumber: number | null;
  githubPrUrl: string | null;
  githubContext: Awaited<ReturnType<typeof getLimitedRepositoryContext>> | null;
  githubContextWarning: string | null;
  activityLogs: BuilderContextLog[];
  recentAgentRuns: BuilderContextRun[];
}

export interface BuilderContextOptions {
  requestedChanges?: string | null;
  iterationNumber?: number;
  workSessionId?: string;
}

/**
 * Gathers the iteration context for a task: the new user instruction plus the
 * history of previous work sessions, last PR review and last builder commit.
 * Used by both the Builder Proposal and Builder Commit agents.
 */
export async function buildIterationContext(
  taskId: string,
  options: BuilderContextOptions = {}
): Promise<BuilderIterationContext> {
  const [workSessions, latestReviewRun, latestCommitRun] = await Promise.all([
    prisma.workSession.findMany({
      where: { taskId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        mode: true,
        status: true,
        summary: true,
        requestedChanges: true,
        iterationNumber: true,
        createdAt: true,
      },
    }),
    prisma.agentRun.findFirst({
      where: { taskId, agentName: "pr-review", status: "completed" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.agentRun.findFirst({
      where: { taskId, agentName: "builder-commit", status: "completed" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  let lastReviewSummary: string | null = null;
  if (latestReviewRun?.output) {
    try {
      const parsed = JSON.parse(latestReviewRun.output);
      lastReviewSummary =
        typeof parsed?.summary === "string" ? parsed.summary : null;
    } catch {
      lastReviewSummary = null;
    }
  }

  let lastBuilderCommitSummary: string | null = null;
  if (latestCommitRun?.output) {
    try {
      const parsed = JSON.parse(latestCommitRun.output);
      lastBuilderCommitSummary =
        typeof parsed?.summary === "string" ? parsed.summary : null;
    } catch {
      lastBuilderCommitSummary = null;
    }
  }

  return {
    isIteration: Boolean(
      options.requestedChanges || (options.iterationNumber ?? 0) > 1
    ),
    requestedChanges: options.requestedChanges ?? null,
    iterationNumber: options.iterationNumber ?? 1,
    previousWorkSessions: workSessions.map((ws) => ({
      id: ws.id,
      mode: ws.mode,
      status: ws.status,
      summary: compactLine(ws.summary, 160),
      requestedChanges: ws.requestedChanges,
      iterationNumber: ws.iterationNumber,
      createdAt: ws.createdAt,
    })),
    lastReviewSummary: compactLine(lastReviewSummary, 160),
    lastBuilderCommitSummary: compactLine(lastBuilderCommitSummary, 160),
  };
}

/**
 * Gathers a safe, limited context for the Builder Proposal agent. GitHub repo
 * context is best-effort: if it fails (no token, missing repo/branch) we record
 * a warning and continue with task/project context.
 */
export async function buildBuilderProposalContext(
  taskId: string,
  options: BuilderContextOptions = {}
): Promise<BuilderProposalContext> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: {
        include: {
          activityLogs: {
            orderBy: { createdAt: "desc" },
            take: getContextBudget().includeActivityLimit,
          },
        },
      },
      agentRuns: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!task) {
    throw new Error("Task not found");
  }

  const project = task.project;

  let githubContext = null;
  let githubContextWarning: string | null = null;

  if (project?.repositoryFullName && task.githubBranchName) {
    const budget = getContextBudget();
    try {
      githubContext = await getLimitedRepositoryContext({
        repositoryFullName: project.repositoryFullName,
        branchName: task.githubBranchName,
        limits: {
          maxFiles: budget.maxFiles,
          maxFileSize: budget.maxFileBytes,
          maxTotalSize: budget.maxTotalBytes,
        },
      });
    } catch (error) {
      githubContext = null;
      githubContextWarning =
        error instanceof Error
          ? error.message
          : "Could not read GitHub repository context";
    }
  } else {
    githubContextWarning =
      "No repository/branch linked — GitHub context unavailable.";
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
    githubIssueNumber: task.githubIssueNumber,
    githubIssueUrl: task.githubIssueUrl,
    githubBranchName: task.githubBranchName,
    githubPlanPath: task.githubPlanPath,
    githubPlanCommitUrl: task.githubPlanCommitUrl,
    githubPrNumber: task.githubPrNumber,
    githubPrUrl: task.githubPrUrl,
    githubContext,
    githubContextWarning,
    activityLogs: (project?.activityLogs ?? []).map((a) => ({
      type: a.type,
      message: compactActivity(a.type, a.message, 140),
      createdAt: a.createdAt,
    })),
    recentAgentRuns: task.agentRuns.map((run) => ({
      agentName: run.agentName,
      model: run.model,
      status: run.status,
      createdAt: run.createdAt,
      finishedAt: run.finishedAt,
    })),
    ...iteration,
  };
}
