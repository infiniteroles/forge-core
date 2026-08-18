import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import type { WorkSessionResult, WorkSessionStage, StageOutcome } from "./types";
import {
  StageContext,
  stageEnsureIssue,
  stageEnsureBranch,
  stageEnsurePlanCommit,
  stageEnsureDraftPr,
  stageEnsureBuilderProposal,
  stageRunBuilderCommit,
  stageAnalyzePr,
  buildHumanSummary,
  PrismaJsonValue,
} from "./stages";

export interface RunDevWorkSessionInput {
  workSessionId: string;
}

interface StageFn {
  key: WorkSessionStage;
  label: string;
  fn: (ctx: StageContext) => Promise<StageOutcome>;
}

const STAGES: StageFn[] = [
  { key: "ensure_issue", label: "Ensure GitHub issue", fn: stageEnsureIssue },
  { key: "ensure_branch", label: "Ensure GitHub branch", fn: stageEnsureBranch },
  { key: "ensure_plan_commit", label: "Ensure plan commit", fn: stageEnsurePlanCommit },
  { key: "ensure_draft_pr", label: "Ensure draft pull request", fn: stageEnsureDraftPr },
  { key: "ensure_builder_proposal", label: "Run Builder Proposal", fn: stageEnsureBuilderProposal },
  { key: "run_builder_commit", label: "Run Builder Commit", fn: stageRunBuilderCommit },
  { key: "analyze_pr", label: "Analyze pull request", fn: stageAnalyzePr },
];

/**
 * Executes the autonomous DEV work session stages in order, reusing the
 * existing GitHub/LLM primitives. Never merges, never deploys, never touches
 * main directly.
 */
export async function runDevWorkSession(workSessionId: string) {
  const ws = await prisma.workSession.findUnique({
    where: { id: workSessionId },
    include: { task: true, project: true },
  });

  if (!ws) {
    throw new Error("Work session not found");
  }
  if (!ws.taskId || !ws.task) {
    throw new Error("Work session has no task");
  }

  const result: WorkSessionResult = {
    taskId: ws.taskId,
    issueUrl: ws.task.githubIssueUrl,
    branchUrl: ws.task.githubBranchUrl,
    prUrl: ws.task.githubPrUrl,
    builderCommitUrl: ws.task.githubBuilderCommitUrl,
    warnings: [],
  };

  const ctx: StageContext = {
    workSessionId: ws.id,
    taskId: ws.taskId,
    task: {
      id: ws.task.id,
      projectId: ws.task.projectId,
      title: ws.task.title,
      description: ws.task.description,
      notes: ws.task.notes,
      type: ws.task.type,
      priority: ws.task.priority,
      status: ws.task.status,
      githubIssueNumber: ws.task.githubIssueNumber,
      githubIssueUrl: ws.task.githubIssueUrl,
      githubBranchName: ws.task.githubBranchName,
      githubPrNumber: ws.task.githubPrNumber,
      githubPrUrl: ws.task.githubPrUrl,
      githubPlanCommitSha: ws.task.githubPlanCommitSha,
    },
    project: {
      id: ws.project.id,
      name: ws.project.name,
      repositoryFullName: ws.project.repositoryFullName,
      repositoryDefaultBranch: ws.project.repositoryDefaultBranch,
    },
    result,
  };

  await prisma.workSession.update({
    where: { id: ws.id },
    data: { status: "running", startedAt: new Date(), currentStage: "ensure_task", error: null },
  });

  let finalStatus = "running";
  let finalSummary: string | null = null;
  let finalError: string | null = null;
  let lastStage: string = "ensure_task";

  for (const stage of STAGES) {
    lastStage = stage.key;
    await prisma.workSession.update({
      where: { id: ws.id },
      data: { currentStage: stage.key },
    });

    await logActivity({
      projectId: ws.task.projectId,
      type: "work_session.stage_started",
      message: `${stage.label} started`,
      metadata: { workSessionId: ws.id, taskId: ws.taskId, stage: stage.key, status: "running" },
    });

    let outcome: StageOutcome;
    try {
      outcome = await stage.fn(ctx);
    } catch (error) {
      outcome = {
        type: "failed",
        error: error instanceof Error ? error.message : "Unknown stage error",
      };
    }

    await logActivity({
      projectId: ws.task.projectId,
      type: "work_session.stage_completed",
      message: `${stage.label} ${outcome.type === "continue" ? "completed" : "stopped"}`,
      metadata: {
        workSessionId: ws.id,
        taskId: ws.taskId,
        stage: stage.key,
        status: outcome.type,
        prUrl: ctx.result.prUrl ?? undefined,
        commitUrl: ctx.result.builderCommitUrl ?? undefined,
      },
    });

    if (outcome.type === "continue") continue;

    if (outcome.type === "waiting_for_user") {
      finalStatus = "waiting_for_user";
      finalSummary = outcome.reason;
      result.warnings?.push(outcome.reason);
      await logActivity({
        projectId: ws.task.projectId,
        type: "work_session.waiting_for_user",
        message: `Work session is waiting for the user: ${outcome.reason}`,
        metadata: { workSessionId: ws.id, taskId: ws.taskId, stage: stage.key, status: finalStatus },
      });
      break;
    }

    if (outcome.type === "completed_with_warnings") {
      finalStatus = "completed_with_warnings";
      finalSummary = buildHumanSummary(result);
      result.warnings?.push(outcome.reason);
      break;
    }

    if (outcome.type === "failed") {
      finalStatus = "failed";
      finalError = outcome.error;
      result.warnings?.push(outcome.error);
      await logActivity({
        projectId: ws.task.projectId,
        type: "work_session.failed",
        message: `Work session failed at ${stage.key}: ${outcome.error}`,
        metadata: { workSessionId: ws.id, taskId: ws.taskId, stage: stage.key, status: "failed" },
      });
      break;
    }
  }

  if (finalStatus === "running") {
    finalStatus = "completed";
    finalSummary = buildHumanSummary(result);
  }

  result.summary = finalSummary ?? undefined;

  await prisma.workSession.update({
    where: { id: ws.id },
    data: {
      status: finalStatus,
      summary: finalSummary,
      currentStage: finalStatus === "completed" ? "summarize_result" : lastStage,
      result: (result as unknown) as PrismaJsonValue,
      error: finalError,
      finishedAt: new Date(),
    },
  });

  if (finalStatus === "completed" || finalStatus === "completed_with_warnings") {
    await logActivity({
      projectId: ws.task.projectId,
      type:
        finalStatus === "completed"
          ? "work_session.completed"
          : "work_session.completed_with_warnings",
      message:
        finalStatus === "completed"
          ? "Work session completed"
          : "Work session completed with warnings",
      metadata: {
        workSessionId: ws.id,
        taskId: ws.taskId,
        status: finalStatus,
        prUrl: ctx.result.prUrl ?? undefined,
        commitUrl: ctx.result.builderCommitUrl ?? undefined,
      },
    });
  }

  return prisma.workSession.findUnique({ where: { id: ws.id } });
}
