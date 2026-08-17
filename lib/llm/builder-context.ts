import { prisma } from "@/lib/db";
import { getLimitedRepositoryContext } from "@/lib/github/context";

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

export interface BuilderProposalContext {
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

/**
 * Gathers a safe, limited context for the Builder Proposal agent. GitHub repo
 * context is best-effort: if it fails (no token, missing repo/branch) we record
 * a warning and continue with task/project context.
 */
export async function buildBuilderProposalContext(
  taskId: string
): Promise<BuilderProposalContext> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: {
        include: {
          activityLogs: { orderBy: { createdAt: "desc" }, take: 15 },
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
    try {
      githubContext = await getLimitedRepositoryContext({
        repositoryFullName: project.repositoryFullName,
        branchName: task.githubBranchName,
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
      message: a.message,
      createdAt: a.createdAt,
    })),
    recentAgentRuns: task.agentRuns.map((run) => ({
      agentName: run.agentName,
      model: run.model,
      status: run.status,
      createdAt: run.createdAt,
      finishedAt: run.finishedAt,
    })),
  };
}
