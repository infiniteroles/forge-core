import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { getIssue } from "@/lib/github/issues";
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
    case "not_found":
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
      return "No GitHub token configured. Set GITHUB_TOKEN to refresh issues.";
    case "forbidden":
      return "GitHub token lacks permission for this repository.";
    case "rate_limited":
      return "GitHub API rate limit exceeded. Retry later.";
    case "not_found":
    case "repository_not_found":
      return "Issue or repository not found.";
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

  if (!task.githubIssueNumber) {
    return NextResponse.json(
      { ok: false, error: "Task has no GitHub issue linked" },
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
    const issue = await getIssue({
      repositoryFullName: project.repositoryFullName,
      issueNumber: task.githubIssueNumber,
    });

    await prisma.task.update({
      where: { id: task.id },
      data: {
        githubIssueState: issue.state,
        githubIssueTitle: issue.title,
        githubIssueUrl: issue.html_url,
        githubIssueUpdatedAt: issue.updated_at
          ? new Date(issue.updated_at)
          : null,
        githubIssueLastCheckedAt: new Date(),
      },
    });

    await logActivity({
      projectId: project.id,
      type: "github.issue.checked",
      message: "GitHub issue checked",
      metadata: {
        taskId: task.id,
        issueNumber: issue.number,
        issueUrl: issue.html_url,
        repositoryFullName: project.repositoryFullName,
      },
    });

    return NextResponse.json({
      ok: true,
      issue: {
        number: issue.number,
        url: issue.html_url,
        state: issue.state,
        title: issue.title,
      },
    });
  } catch (error) {
    const code = error instanceof GithubError ? error.code : undefined;

    await logActivity({
      projectId: project.id,
      type: "github.issue.check_failed",
      message: "GitHub issue check failed",
      metadata: {
        taskId: task.id,
        issueNumber: task.githubIssueNumber,
        repositoryFullName: project.repositoryFullName,
      },
    });

    return NextResponse.json(
      { ok: false, error: messageForCode(code) },
      { status: statusForCode(code) }
    );
  }
}
