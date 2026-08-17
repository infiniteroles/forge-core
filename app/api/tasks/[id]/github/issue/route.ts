import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { createIssue } from "@/lib/github/issues";
import { GithubError, GithubErrorCode } from "@/lib/github/types";
import { TASK_TYPE_LABELS, TASK_PRIORITY_LABELS } from "@/lib/task";

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
      return 404;
    case "validation_error":
    case "invalid_full_name":
      return 400;
    case "issues_disabled":
      return 422;
    default:
      return 502;
  }
}

function messageForCode(code?: GithubErrorCode): string {
  switch (code) {
    case "token_missing":
    case "not_configured":
      return "No GitHub token configured. Set GITHUB_TOKEN to create issues.";
    case "forbidden":
      return "GitHub token lacks permission for this repository.";
    case "rate_limited":
      return "GitHub API rate limit exceeded. Retry later.";
    case "repository_not_found":
      return "Repository not found or GitHub token lacks access.";
    case "issues_disabled":
      return "Issues are disabled for this repository.";
    case "validation_error":
    case "invalid_full_name":
      return "Invalid issue payload or repository full name.";
    default:
      return "GitHub API is unreachable. Try again later.";
  }
}

function buildIssueBody(input: {
  projectName: string;
  projectDevUrl: string | null;
  projectTargetDevDomain: string | null;
  repositoryFullName: string;
  task: {
    type: string;
    priority: string;
    status: string;
    description: string | null;
    assignedAgent: string | null;
    notes: string | null;
  };
}): string {
  const { projectName, projectDevUrl, projectTargetDevDomain, repositoryFullName, task } =
    input;
  const devUrl = projectDevUrl || projectTargetDevDomain;

  return [
    "## Forge Task",
    "",
    `**Project:** ${projectName}`,
    `**Task type:** ${TASK_TYPE_LABELS[task.type] ?? task.type}`,
    `**Priority:** ${TASK_PRIORITY_LABELS[task.priority] ?? task.priority}`,
    `**Status in Forge:** ${task.status}`,
    `**Assigned agent:** ${task.assignedAgent ?? "Not assigned"}`,
    "",
    "## Description",
    "",
    task.description ?? "",
    "",
    "## Notes",
    "",
    task.notes ?? "No notes",
    "",
    "## Source",
    "",
    "Created from Forge Core01.",
    "",
    `Project DEV URL: ${devUrl ?? "—"}`,
    `Repository: ${repositoryFullName}`,
  ].join("\n");
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

  if (task.githubIssueNumber) {
    return NextResponse.json(
      { ok: false, error: "Task already has a GitHub issue linked" },
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

  const body = buildIssueBody({
    projectName: project.name,
    projectDevUrl: project.devUrl,
    projectTargetDevDomain: project.targetDevDomain,
    repositoryFullName: project.repositoryFullName,
    task,
  });

  try {
    const issue = await createIssue({
      repositoryFullName: project.repositoryFullName,
      title: task.title,
      body,
    });

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        githubIssueNumber: issue.number,
        githubIssueUrl: issue.html_url,
        githubIssueState: issue.state,
        githubIssueTitle: issue.title,
        githubIssueCreatedAt: issue.created_at
          ? new Date(issue.created_at)
          : null,
        githubIssueUpdatedAt: issue.updated_at
          ? new Date(issue.updated_at)
          : null,
        githubIssueLastCheckedAt: new Date(),
      },
    });

    await logActivity({
      projectId: project.id,
      type: "github.issue.created",
      message: "GitHub issue created",
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
        createdAt: updated.githubIssueCreatedAt,
        updatedAt: updated.githubIssueUpdatedAt,
      },
    });
  } catch (error) {
    const code = error instanceof GithubError ? error.code : undefined;

    await logActivity({
      projectId: project.id,
      type: "github.issue.create_failed",
      message: "GitHub issue creation failed",
      metadata: {
        taskId: task.id,
        repositoryFullName: project.repositoryFullName,
      },
    });

    return NextResponse.json(
      { ok: false, error: messageForCode(code) },
      { status: statusForCode(code) }
    );
  }
}
