import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { isGithubConfigured } from "@/lib/github/client";
import { getPullRequest } from "@/lib/github/pull-requests";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Optional refresh for the PR Review Gate: refreshes PR state plus the last
 * review checked timestamp. For a full re-analysis use the Analyze PR endpoint.
 */
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
      { ok: false, error: "Task has no GitHub pull request." },
      { status: 400 }
    );
  }

  if (!isGithubConfigured()) {
    return NextResponse.json(
      { ok: false, error: "GitHub token is not configured" },
      { status: 503 }
    );
  }

  try {
    const pr = await getPullRequest({
      repositoryFullName: task.project.repositoryFullName,
      prNumber: task.githubPrNumber,
    });

    const now = new Date();

    await prisma.task.update({
      where: { id: task.id },
      data: {
        githubPrState: pr.state,
        githubPrDraft: pr.draft,
        githubPrUpdatedAt: pr.updated_at ? new Date(pr.updated_at) : undefined,
        githubPrMergedAt: pr.merged_at ? new Date(pr.merged_at) : undefined,
        githubPrLastCheckedAt: now,
        githubPrReviewLastCheckedAt: now,
      },
    });

    await logActivity({
      projectId: task.projectId,
      type: "github.pr.checked",
      message: `PR #${task.githubPrNumber} checked for task "${task.title}"`,
      metadata: {
        taskId: task.id,
        prNumber: task.githubPrNumber,
        prUrl: pr.html_url,
        draft: pr.draft,
        state: pr.state,
      },
    });

    return NextResponse.json({ ok: true, pr });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error while checking the PR";
    return NextResponse.json(
      { ok: false, error: `PR check failed: ${message}` },
      { status: 502 }
    );
  }
}
