import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { isLLMConfigured, getLLMConfig } from "@/lib/llm/client";
import { LLMError } from "@/lib/llm/types";
import { getPullRequest } from "@/lib/github/pull-requests";
import { runPrReviewAgent } from "@/lib/llm/pr-review";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    include: { project: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (!task.project?.repositoryFullName) {
    return NextResponse.json(
      { ok: false, error: "Task must belong to a project with a linked repository." },
      { status: 400 }
    );
  }

  if (!task.githubPrNumber) {
    return NextResponse.json(
      { ok: false, error: "Task must have a GitHub pull request before review" },
      { status: 400 }
    );
  }

  if (!isLLMConfigured()) {
    return NextResponse.json(
      { ok: false, error: "LLM provider is not configured" },
      { status: 503 }
    );
  }

  // Confirm the PR is open before reviewing.
  const pr = await getPullRequest({
    repositoryFullName: task.project.repositoryFullName,
    prNumber: task.githubPrNumber,
  });
  if (pr.state !== "open") {
    return NextResponse.json(
      { ok: false, error: "The pull request is not open; cannot review it." },
      { status: 400 }
    );
  }

  const run = await prisma.agentRun.create({
    data: {
      projectId: task.projectId,
      taskId: task.id,
      agentName: "pr-review",
      model: getLLMConfig().model,
      status: "running",
      startedAt: new Date(),
    },
  });

  await logActivity({
    projectId: task.projectId,
    type: "github.pr_review.created",
    message: `PR review requested for task "${task.title}"`,
    metadata: {
      taskId: task.id,
      agentRunId: run.id,
      prNumber: task.githubPrNumber,
      prUrl: task.githubPrUrl,
    },
  });

  try {
    const result = await runPrReviewAgent(task.id);

    const output =
      result.status === "completed"
        ? JSON.stringify(result.output)
        : JSON.stringify({
            status: "completed_with_warnings",
            reason: result.reason,
            raw: result.raw,
          });

    const now = new Date();

    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: result.status,
        output,
        model: result.model,
        finishedAt: now,
      },
    });

    if (result.status === "completed_with_warnings") {
      await prisma.task.update({
        where: { id: task.id },
        data: {
          githubPrReviewRunId: run.id,
          githubPrReviewStatus: "completed_with_warnings",
          githubPrReviewSummary: result.reason.slice(0, 300),
          githubPrReviewRecommendation: null,
          githubPrReviewRiskLevel: null,
          githubPrReviewReadyForReview: false,
          githubPrReviewLastCheckedAt: now,
        },
      });

      await logActivity({
        projectId: task.projectId,
        type: "github.pr_review.completed",
        message: `PR review completed with warnings for task "${task.title}"`,
        metadata: {
          taskId: task.id,
          agentRunId: run.id,
          prNumber: task.githubPrNumber,
          prUrl: task.githubPrUrl,
          status: "completed_with_warnings",
        },
      });

      return NextResponse.json({
        ok: true,
        status: "completed_with_warnings",
        reason: result.reason,
        agentRunId: run.id,
      });
    }

    // completed
    const review = result.output;

    await prisma.task.update({
      where: { id: task.id },
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

    await logActivity({
      projectId: task.projectId,
      type: "github.pr_review.completed",
      message: `PR review completed for task "${task.title}"`,
      metadata: {
        taskId: task.id,
        agentRunId: run.id,
        prNumber: task.githubPrNumber,
        prUrl: task.githubPrUrl,
        recommendation: review.recommendation,
        riskLevel: review.risk_level,
        readyForReview: review.ready_for_review,
      },
    });

    return NextResponse.json({
      ok: true,
      status: "completed",
      review,
      agentRunId: run.id,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error while reviewing the pull request";
    const code = error instanceof LLMError ? error.code : undefined;

    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "failed", output: message, finishedAt: new Date() },
    });

    await logActivity({
      projectId: task.projectId,
      type: "github.pr_review.failed",
      message: `PR review failed for task "${task.title}"`,
      metadata: {
        taskId: task.id,
        agentRunId: run.id,
        prNumber: task.githubPrNumber,
        prUrl: task.githubPrUrl,
      },
    });

    if (code === "not_configured") {
      return NextResponse.json(
        { ok: false, error: "LLM provider is not configured" },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { ok: false, error: `PR review failed: ${message}` },
      { status: 502 }
    );
  }
}
