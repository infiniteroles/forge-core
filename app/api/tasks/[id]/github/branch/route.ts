import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import {
  createBranch,
  getBranchRef,
} from "@/lib/github/branches";
import { generateBranchNameCandidates } from "@/lib/github/branch-name";
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
    case "validation_error":
    case "invalid_full_name":
    case "branch_already_exists":
      return 400;
    default:
      return 502;
  }
}

function messageForCode(code?: GithubErrorCode): string {
  switch (code) {
    case "token_missing":
    case "not_configured":
      return "No GitHub token configured. Set GITHUB_TOKEN to create branches.";
    case "forbidden":
      return "GitHub token lacks permission for this repository.";
    case "rate_limited":
      return "GitHub API rate limit exceeded. Retry later.";
    case "repository_not_found":
      return "Repository not found or GitHub token lacks access.";
    case "branch_not_found":
      return "Default branch not found.";
    case "branch_already_exists":
      return "A branch with this name already exists.";
    case "validation_error":
    case "invalid_full_name":
      return "Invalid branch name or repository full name.";
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

  if (task.githubBranchName) {
    return NextResponse.json(
      { ok: false, error: "Task already has a GitHub branch linked" },
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

  const defaultBranch = project.repositoryDefaultBranch || "main";

  try {
    // 1. Resolve the base SHA from the default branch.
    const baseRef = await getBranchRef({
      repositoryFullName: project.repositoryFullName,
      branchName: defaultBranch,
    });

    // 2. Try candidate branch names, skipping collisions.
    const candidates = generateBranchNameCandidates(task);
    let created = null;
    let lastCode: GithubErrorCode | undefined;

    for (const candidate of candidates) {
      try {
        created = await createBranch({
          repositoryFullName: project.repositoryFullName,
          branchName: candidate,
          baseSha: baseRef.sha,
        });
        break;
      } catch (error) {
        if (error instanceof GithubError && error.code === "branch_already_exists") {
          lastCode = error.code;
          continue;
        }
        throw error;
      }
    }

    if (!created) {
      throw new GithubError(
        "Could not find a free branch name",
        lastCode ?? "branch_already_exists"
      );
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        githubBranchName: created.name,
        githubBranchUrl: created.url,
        githubBaseBranch: defaultBranch,
        githubBaseSha: baseRef.sha,
        githubBranchCreatedAt: new Date(),
        githubBranchLastCheckedAt: new Date(),
      },
    });

    await logActivity({
      projectId: project.id,
      type: "github.branch.created",
      message: "GitHub branch created",
      metadata: {
        taskId: task.id,
        branchName: created.name,
        branchUrl: created.url,
        repositoryFullName: project.repositoryFullName,
        baseBranch: defaultBranch,
        baseSha: baseRef.sha,
      },
    });

    return NextResponse.json({
      ok: true,
      branch: {
        name: created.name,
        url: created.url,
        baseBranch: defaultBranch,
        baseSha: baseRef.sha,
        createdAt: updated.githubBranchCreatedAt,
      },
    });
  } catch (error) {
    const code = error instanceof GithubError ? error.code : undefined;

    await logActivity({
      projectId: project.id,
      type: "github.branch.create_failed",
      message: "GitHub branch creation failed",
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
