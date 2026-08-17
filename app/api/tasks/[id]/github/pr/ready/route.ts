import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { isGithubConfigured } from "@/lib/github/client";
import { getPullRequest, markPullRequestReady } from "@/lib/github/pull-requests";
import { parsePrReviewOutput } from "@/lib/llm/pr-review";

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
      { ok: false, error: "Task must have a GitHub pull request before marking it ready." },
      { status: 400 }
    );
  }

  if (!isGithubConfigured()) {
    return NextResponse.json(
      { ok: false, error: "GitHub token is not configured" },
      { status: 503 }
    );
  }

  // The PR must exist and be a draft.
  const pr = await getPullRequest({
    repositoryFullName: task.project.repositoryFullName,
    prNumber: task.githubPrNumber,
  });
  if (pr.state !== "open") {
    return NextResponse.json(
      { ok: false, error: "The pull request is not open; cannot mark it ready." },
      { status: 400 }
    );
  }
  if (!pr.draft) {
    return NextResponse.json(
      { ok: false, error: "The pull request is already marked ready for review." },
      { status: 400 }
    );
  }

  // Require a completed PR review that recommends ready.
  const reviewRun = await prisma.agentRun.findFirst({
    where: { taskId: task.id, agentName: "pr-review", status: "completed" },
    orderBy: { createdAt: "desc" },
  });
  const review = reviewRun ? parsePrReviewOutput(reviewRun.output) : null;

  if (!review || review.ready_for_review !== true) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Latest PR review does not recommend marking this PR ready for review",
      },
      { status: 400 }
    );
  }

  try {
    const updated = await markPullRequestReady({
      repositoryFullName: task.project.repositoryFullName,
      prNumber: task.githubPrNumber,
    });

    const now = new Date();

    await prisma.task.update({
      where: { id: task.id },
      data: {
        githubPrDraft: false,
        githubPrState: updated.state || "open",
        githubPrLastCheckedAt: now,
        githubPrMarkedReadyAt: now,
      },
    });

    await logActivity({
      projectId: task.projectId,
      type: "github.pr.ready_for_review",
      message: `PR #${task.githubPrNumber} marked ready for review for task "${task.title}"`,
      metadata: {
        taskId: task.id,
        prNumber: task.githubPrNumber,
        prUrl: updated.html_url,
        recommendation: review.recommendation,
        riskLevel: review.risk_level,
        readyForReview: true,
      },
    });

    return NextResponse.json({ ok: true, pr: updated });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error while marking the pull request ready";

    await logActivity({
      projectId: task.projectId,
      type: "github.pr.ready_for_review_failed",
      message: `Failed to mark PR #${task.githubPrNumber} ready for task "${task.title}"`,
      metadata: {
        taskId: task.id,
        prNumber: task.githubPrNumber,
        prUrl: task.githubPrUrl,
      },
    });

    return NextResponse.json(
      { ok: false, error: `Mark ready failed: ${message}` },
      { status: 502 }
    );
  }
}
