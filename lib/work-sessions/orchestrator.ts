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
  stageRefreshContext,
  stageEnsureExistingTask,
  stageRunIterationBuilderProposal,
  buildHumanSummary,
  buildIterationSummary,
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

const DEV_STAGES: StageFn[] = [
  { key: "ensure_issue", label: "Ensure GitHub issue", fn: stageEnsureIssue },
  { key: "ensure_branch", label: "Ensure GitHub branch", fn: stageEnsureBranch },
  { key: "ensure_plan_commit", label: "Ensure plan commit", fn: stageEnsurePlanCommit },
  { key: "ensure_draft_pr", label: "Ensure draft pull request", fn: stageEnsureDraftPr },
  { key: "ensure_builder_proposal", label: "Run Builder Proposal", fn: stageEnsureBuilderProposal },
  { key: "run_builder_commit", label: "Run Builder Commit", fn: stageRunBuilderCommit },
  { key: "analyze_pr", label: "Analyze pull request", fn: stageAnalyzePr },
];

const ITERATION_STAGES: StageFn[] = [
  { key: "refresh_context", label: "Refresh task context", fn: stageRefreshContext },
  { key: "ensure_existing_task", label: "Ensure existing task", fn: stageEnsureExistingTask },
  { key: "ensure_issue", label: "Ensure GitHub issue", fn: stageEnsureIssue },
  { key: "ensure_branch", label: "Ensure GitHub branch", fn: stageEnsureBranch },
  { key: "ensure_draft_pr", label: "Ensure draft pull request", fn: stageEnsureDraftPr },
  { key: "run_iteration_builder_proposal", label: "Run Builder Proposal", fn: stageRunIterationBuilderProposal },
  { key: "run_builder_commit", label: "Run Builder Commit", fn: stageRunBuilderCommit },
  { key: "analyze_pr", label: "Analyze pull request", fn: stageAnalyzePr },
];

/**
 * Executes the shared work-session stage pipeline (dev or iteration) and
 * persists the final state. Never merges, never deploys, never touches main.
 */
async function runSession(
  workSessionId: string,
  stages: StageFn[],
  isIteration: boolean
) {
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
    isIteration,
    requestedChanges: ws.requestedChanges,
    iterationNumber: ws.iterationNumber,
  };

  const ctx: StageContext = {
    workSessionId: ws.id,
    taskId: ws.taskId,
    mode: ws.mode,
    requestedChanges: ws.requestedChanges,
    iterationNumber: ws.iterationNumber,
    parentWorkSessionId: ws.parentWorkSessionId,
    isIteration,
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
    data: { status: "running", startedAt: new Date(), currentStage: stages[0].key, error: null },
  });

  async function refreshTaskContext() {
    const task = await prisma.task.findUnique({ where: { id: ctx.taskId } });
    if (task) {
      ctx.task = {
        id: task.id,
        projectId: task.projectId,
        title: task.title,
        description: task.description,
        notes: task.notes,
        type: task.type,
        priority: task.priority,
        status: task.status,
        githubIssueNumber: task.githubIssueNumber,
        githubIssueUrl: task.githubIssueUrl,
        githubBranchName: task.githubBranchName,
        githubPrNumber: task.githubPrNumber,
        githubPrUrl: task.githubPrUrl,
        githubPlanCommitSha: task.githubPlanCommitSha,
      };
    }
  }

  // Refresh once up-front so iteration starts from the freshest task state.
  await refreshTaskContext();

  let finalStatus = "running";
  let finalSummary: string | null = null;
  let finalError: string | null = null;
  let lastStage: string = stages[0].key;

  for (const stage of stages) {
    lastStage = stage.key;
    await prisma.workSession.update({
      where: { id: ws.id },
      data: { currentStage: stage.key },
    });

    await logActivity({
      projectId: ws.task.projectId,
      type: "work_session.stage_started",
      message: `${stage.label} started`,
      metadata: {
        workSessionId: ws.id,
        taskId: ws.taskId,
        stage: stage.key,
        status: "running",
        iterationNumber: ws.iterationNumber,
        parentWorkSessionId: ws.parentWorkSessionId ?? undefined,
      },
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

    // Reload the task from the DB so the next stage sees fields created by this
    // stage (issue/branch/PR/plan), not the stale session snapshot.
    await refreshTaskContext();

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
      finalSummary = isIteration
        ? buildIterationSummary(result, ws.requestedChanges)
        : buildHumanSummary(result);
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
    finalSummary = isIteration
      ? buildIterationSummary(result, ws.requestedChanges)
      : buildHumanSummary(result);
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
    const completed = finalStatus === "completed";
    await logActivity({
      projectId: ws.task.projectId,
      type: isIteration
        ? completed
          ? "work_session.iteration_completed"
          : "work_session.iteration_completed_with_warnings"
        : completed
          ? "work_session.completed"
          : "work_session.completed_with_warnings",
      message: isIteration
        ? completed
          ? "Work session iteration completed"
          : "Work session iteration completed with warnings"
        : completed
          ? "Work session completed"
          : "Work session completed with warnings",
      metadata: {
        workSessionId: ws.id,
        parentWorkSessionId: ws.parentWorkSessionId ?? undefined,
        taskId: ws.taskId,
        iterationNumber: ws.iterationNumber,
        status: finalStatus,
        prUrl: ctx.result.prUrl ?? undefined,
        commitUrl: ctx.result.builderCommitUrl ?? undefined,
        instruction: ws.requestedChanges ? ws.requestedChanges.slice(0, 200) : undefined,
      },
    });
  }

  return prisma.workSession.findUnique({ where: { id: ws.id } });
}

/**
 * Executes the autonomous DEV work session stages in order, reusing the
 * existing GitHub/LLM primitives. Never merges, never deploys, never touches
 * main directly.
 */
export async function runDevWorkSession(workSessionId: string) {
  return runSession(workSessionId, DEV_STAGES, false);
}

/**
 * Executes an ITERATION work session. Reuses the same task, branch and PR
 * (never creates a new one), applies the user's new instruction on top of the
 * current state, produces a new commit on the same branch, re-analyzes the PR
 * and generates an updated human summary. Never merges, never deploys, never
 * touches main directly.
 */
export async function runIterationWorkSession(workSessionId: string) {
  return runSession(workSessionId, ITERATION_STAGES, true);
}
