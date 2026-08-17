import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import {
  createPullRequest,
  findOpenPullRequestForBranch,
} from "@/lib/github/pull-requests";
import {
  buildPullRequestBody,
  buildPullRequestTitle,
} from "@/lib/github/pull-request";
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
      return 404;
    case "pull_request_already_exists":
    case "no_commits_between":
    case "validation_error":
    case "invalid_full_name":
      return 409;
    default:
      return 502;
  }
}

function messageForCode(code?: GithubErrorCode): string {
  switch (code) {
    case "token_missing":
    case "not_configured":
      return "No GitHub token configured. Set GITHUB_TOKEN to create draft PRs.";
    case "forbidden":
      return "GitHub token lacks permission for this repository.";
    case "rate_limited":
      return "GitHub API rate limit exceeded. Retry later.";
    case "repository_not_found":
      return "Repository not found or GitHub token lacks access.";
    case "branch_not_found":
      return "The task branch no longer exists in GitHub.";
    case "pull_request_already_exists":
      return "A pull request already exists for this branch.";
    case "no_commits_between":
      return "No commits between base and head branches. Add the plan commit first.";
    case "validation_error":
    case "invalid_full_name":
      return "Invalid pull request payload or repository full name.";
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

  if (task.githubPrNumber) {
    return NextResponse.json(
      { ok: false, error: "Task already has a GitHub pull request linked" },
      { status: 409 }
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
      {
        ok: false,
        error:
          "No repository linked yet. Edit the project to add a repository full name.",
      },
      { status: 400 }
    );
  }

  if (!task.githubBranchName) {
    return NextResponse.json(
      {
        ok: false,
        error: "Task must have a GitHub branch before creating a draft PR",
      },
      { status: 400 }
    );
  }

  const baseBranch =
    task.githubBaseBranch ||
    project.repositoryDefaultBranch ||
    "main";

  const title = buildPullRequestTitle(task.title);
  const body = buildPullRequestBody({
    task,
    project: { name: project.name },
  });

  try {
    // Avoid creating a duplicate if an open PR already exists from this branch.
    const existing = await findOpenPullRequestForBranch({
      repositoryFullName: project.repositoryFullName,
      headBranch: task.githubBranchName,
    });

    if (existing) {
      throw new GithubError(
        "A pull request already exists for this branch",
        "pull_request_already_exists"
      );
    }

    const pr = await createPullRequest({
      repositoryFullName: project.repositoryFullName,
      title,
      body,
      baseBranch,
      headBranch: task.githubBranchName,
      draft: true,
    });

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        githubPrNumber: pr.number,
        githubPrUrl: pr.html_url,
        githubPrState: pr.state,
        githubPrTitle: pr.title,
        githubPrDraft: pr.draft,
        githubPrBaseBranch: pr.baseBranch,
        githubPrHeadBranch: pr.headBranch,
        githubPrCreatedAt: pr.created_at ? new Date(pr.created_at) : new Date(),
        githubPrUpdatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
        githubPrMergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
        githubPrLastCheckedAt: new Date(),
      },
    });

    await logActivity({
      projectId: project.id,
      type: "github.pr.created",
      message: "GitHub draft pull request created",
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
        baseBranch: pr.baseBranch,
        headBranch: pr.headBranch,
        createdAt: updated.githubPrCreatedAt,
      },
    });
  } catch (error) {
    const code = error instanceof GithubError ? error.code : undefined;

    await logActivity({
      projectId: project.id,
      type: "github.pr.create_failed",
      message: "GitHub draft pull request creation failed",
      metadata: {
        taskId: task.id,
        repositoryFullName: project.repositoryFullName,
        baseBranch,
        headBranch: task.githubBranchName,
      },
    });

    return NextResponse.json(
      { ok: false, error: messageForCode(code) },
      { status: statusForCode(code) }
    );
  }
}
