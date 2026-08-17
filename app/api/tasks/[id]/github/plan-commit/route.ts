import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { createOrUpdateFile } from "@/lib/github/files";
import {
  buildPlanCommitMessage,
  buildPlanPath,
  generatePlanMarkdown,
} from "@/lib/github/task-plan";
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
    case "file_not_found":
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
      return "No GitHub token configured. Set GITHUB_TOKEN to create plan commits.";
    case "forbidden":
      return "GitHub token lacks permission for this repository.";
    case "rate_limited":
      return "GitHub API rate limit exceeded. Retry later.";
    case "repository_not_found":
      return "Repository not found or GitHub token lacks access.";
    case "branch_not_found":
      return "The task branch no longer exists in GitHub.";
    case "file_not_found":
      return "File not found.";
    case "validation_error":
    case "invalid_full_name":
      return "Invalid file path or repository full name.";
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
        error: "Task must have a GitHub branch before creating a plan commit",
      },
      { status: 400 }
    );
  }

  const path = buildPlanPath(task.id);
  const message = buildPlanCommitMessage(task.title);
  const content = generatePlanMarkdown({
    task,
    project: {
      name: project.name,
      repositoryFullName: project.repositoryFullName,
    },
    generatedAt: new Date().toISOString(),
  });

  try {
    const result = await createOrUpdateFile({
      repositoryFullName: project.repositoryFullName,
      branchName: task.githubBranchName,
      path,
      message,
      content,
    });

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        githubPlanPath: result.path,
        githubPlanCommitSha: result.commitSha,
        githubPlanCommitUrl: result.commitUrl,
        githubPlanCommitMessage: result.commitMessage,
        githubPlanCommittedAt: result.committedAt
          ? new Date(result.committedAt)
          : new Date(),
        githubPlanLastCheckedAt: new Date(),
      },
    });

    const metadata = {
      taskId: task.id,
      path: result.path,
      commitSha: result.commitSha,
      commitUrl: result.commitUrl,
      repositoryFullName: project.repositoryFullName,
      branchName: task.githubBranchName,
    };

    await logActivity({
      projectId: project.id,
      type: result.updated
        ? "github.plan_commit.updated"
        : "github.plan_commit.created",
      message: result.updated
        ? "GitHub plan commit updated"
        : "GitHub plan commit created",
      metadata,
    });

    return NextResponse.json({
      ok: true,
      commit: {
        path: result.path,
        sha: result.commitSha,
        url: result.commitUrl,
        message: result.commitMessage,
        committedAt: updated.githubPlanCommittedAt,
        updated: result.updated,
      },
    });
  } catch (error) {
    const code = error instanceof GithubError ? error.code : undefined;

    await logActivity({
      projectId: project.id,
      type: "github.plan_commit.create_failed",
      message: "GitHub plan commit creation failed",
      metadata: {
        taskId: task.id,
        path,
        repositoryFullName: project.repositoryFullName,
        branchName: task.githubBranchName,
      },
    });

    return NextResponse.json(
      { ok: false, error: messageForCode(code) },
      { status: statusForCode(code) }
    );
  }
}
