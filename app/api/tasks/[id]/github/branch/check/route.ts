import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { getBranch } from "@/lib/github/branches";
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
    case "branch_not_found":
    case "repository_not_found":
      return 404;
    case "validation_error":
    case "invalid_full_name":
      return 400;
    default:
      return 502;
  }
}

function messageForCode(code?: GithubErrorCode): string {
  switch (code) {
    case "token_missing":
    case "not_configured":
      return "No GitHub token configured. Set GITHUB_TOKEN to refresh branches.";
    case "forbidden":
      return "GitHub token lacks permission for this repository.";
    case "rate_limited":
      return "GitHub API rate limit exceeded. Retry later.";
    case "branch_not_found":
      return "Branch no longer exists in GitHub.";
    case "repository_not_found":
      return "Repository not found or GitHub token lacks access.";
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

  if (!task.githubBranchName) {
    return NextResponse.json(
      { ok: false, error: "Task has no GitHub branch linked" },
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
    const branch = await getBranch({
      repositoryFullName: project.repositoryFullName,
      branchName: task.githubBranchName,
    });

    await prisma.task.update({
      where: { id: task.id },
      data: {
        githubBranchUrl: branch.url,
        githubBranchLastCheckedAt: new Date(),
        githubBaseSha: branch.sha ?? task.githubBaseSha,
      },
    });

    await logActivity({
      projectId: project.id,
      type: "github.branch.checked",
      message: "GitHub branch checked",
      metadata: {
        taskId: task.id,
        branchName: branch.name,
        branchUrl: branch.url,
        repositoryFullName: project.repositoryFullName,
        baseBranch: task.githubBaseBranch,
        baseSha: branch.sha,
      },
    });

    return NextResponse.json({
      ok: true,
      branch: {
        name: branch.name,
        url: branch.url,
        sha: branch.sha,
      },
    });
  } catch (error) {
    const code = error instanceof GithubError ? error.code : undefined;

    await logActivity({
      projectId: project.id,
      type: "github.branch.check_failed",
      message: "GitHub branch check failed",
      metadata: {
        taskId: task.id,
        branchName: task.githubBranchName,
        repositoryFullName: project.repositoryFullName,
      },
    });

    return NextResponse.json(
      { ok: false, error: messageForCode(code) },
      { status: statusForCode(code) }
    );
  }
}
