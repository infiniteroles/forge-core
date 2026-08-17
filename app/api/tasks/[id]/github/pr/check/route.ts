import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { getPullRequest } from "@/lib/github/pull-requests";
import { GithubError, GithubErrorCode } from "@/lib/github/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function statusForCode(code?: GithubErrorCode): number {
  switch (code) {
    case "token_missing":
    case "not_configured":
      return 503;
    case "forbidden":
      return 403;
    case "rate_limited":
      return 429;
    case "repository_not_found":
    case "branch_not_found":
    case "not_found":
      return 404;
    default:
      return 502;
  }
}

function messageForCode(code?: GithubErrorCode): string {
  switch (code) {
    case "token_missing":
    case "not_configured":
      return "No GitHub token configured. Set GITHUB_TOKEN to refresh PRs.";
    case "forbidden":
      return "GitHub token lacks permission for this repository.";
    case "rate_limited":
      return "GitHub API rate limit exceeded. Retry later.";
    case "repository_not_found":
    case "not_found":
      return "Pull request or repository not found.";
    default:
      return "GitHub API is unreachable. Try again later.";
  }
}

export async function POST(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (!task.githubPrNumber) {
    return NextResponse.json(
      { ok: false, error: "Task has no GitHub pull request linked" },
      { status: 400 }
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: task.projectId },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!project.repositoryFullName) {
    return NextResponse.json(
      { ok: false, error: "Project has no repository linked" },
      { status: 400 }
    );
  }

  try {
    const pr = await getPullRequest({
      repositoryFullName: project.repositoryFullName,
      prNumber: task.githubPrNumber,
    });

    await prisma.task.update({
      where: { id: task.id },
      data: {
        githubPrState: pr.state,
        githubPrTitle: pr.title,
        githubPrDraft: pr.draft,
        githubPrUrl: pr.html_url,
        githubPrBaseBranch: pr.baseBranch,
        githubPrHeadBranch: pr.headBranch,
        githubPrUpdatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
        githubPrMergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
        githubPrLastCheckedAt: new Date(),
      },
    });

    await logActivity({
      projectId: project.id,
      type: "github.pr.checked",
      message: "GitHub pull request checked",
      metadata: {
        taskId: task.id,
        prNumber: pr.number,
        prUrl: pr.html_url,
        repositoryFullName: project.repositoryFullName,
        baseBranch: pr.baseBranch,
        headBranch: pr.headBranch,
      },
    });

    return NextResponse.json({
      ok: true,
      pullRequest: {
        number: pr.number,
        url: pr.html_url,
        state: pr.state,
        draft: pr.draft,
        title: pr.title,
      },
    });
  } catch (error) {
    const code = error instanceof GithubError ? error.code : undefined;

    await logActivity({
      projectId: project.id,
      type: "github.pr.check_failed",
      message: "GitHub pull request check failed",
      metadata: {
        taskId: task.id,
        prNumber: task.githubPrNumber,
        repositoryFullName: project.repositoryFullName,
      },
    });

    return NextResponse.json(
      { ok: false, error: messageForCode(code) },
      { status: statusForCode(code) }
    );
  }
}
