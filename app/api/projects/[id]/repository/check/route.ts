import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { checkRepository } from "@/lib/github/repository";
import { GithubError, GithubErrorCode } from "@/lib/github/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function statusForCode(code?: GithubErrorCode): number {
  switch (code) {
    case "not_found":
    case "forbidden":
      return 404;
    case "rate_limited":
      return 429;
    case "not_configured":
      return 503;
    case "invalid_full_name":
      return 400;
    default:
      return 502;
  }
}

function messageForCode(code?: GithubErrorCode): string {
  switch (code) {
    case "not_found":
    case "forbidden":
      return "Repository not found or GitHub token lacks access";
    case "rate_limited":
      return "GitHub API rate limit exceeded. Add a GITHUB_TOKEN or retry later.";
    case "not_configured":
      return "No GitHub token set. Only public repositories can be checked.";
    case "invalid_full_name":
      return "Invalid repository full name. Use the format owner/repo.";
    default:
      return "GitHub API is unreachable. Try again later.";
  }
}

export async function POST(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
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

  try {
    const repo = await checkRepository(project.repositoryFullName);

    const hadUrl = Boolean(project.repositoryUrl);

    const updated = await prisma.project.update({
      where: { id },
      data: {
        repositoryUrl: repo.url,
        repositoryDefaultBranch: repo.defaultBranch,
        repositoryVisibility: repo.visibility,
        repositoryDescription: repo.description,
        repositoryLastCommitSha: repo.lastCommitSha,
        repositoryLastCommitMessage: repo.lastCommitMessage,
        repositoryLastCommitUrl: repo.lastCommitUrl,
        repositoryLastCommitAt: repo.lastCommitAt
          ? new Date(repo.lastCommitAt)
          : null,
        repositoryLastCheckedAt: new Date(),
        // Keep repoUrl in sync when it was empty (legacy field, not removed yet).
        repoUrl: project.repoUrl ? undefined : repo.url,
      },
    });

    const metadata = {
      repositoryFullName: repo.fullName,
      repositoryUrl: repo.url,
      defaultBranch: repo.defaultBranch,
      visibility: repo.visibility,
    };

    await logActivity({
      projectId: id,
      type: "repository.checked",
      message: "Repository checked",
      metadata,
    });

    if (!hadUrl) {
      await logActivity({
        projectId: id,
        type: "repository.linked",
        message: "Repository linked",
        metadata,
      });
    }

    return NextResponse.json({
      ok: true,
      repository: {
        fullName: repo.fullName,
        url: repo.url,
        defaultBranch: repo.defaultBranch,
        visibility: repo.visibility,
        description: repo.description,
        lastCommitSha: repo.lastCommitSha,
        lastCommitMessage: repo.lastCommitMessage,
        lastCommitAt: repo.lastCommitAt,
        lastCheckedAt: updated.repositoryLastCheckedAt,
      },
    });
  } catch (error) {
    const code = error instanceof GithubError ? error.code : undefined;

    await logActivity({
      projectId: id,
      type: "repository.check_failed",
      message: "Repository check failed",
      metadata: { repositoryFullName: project.repositoryFullName },
    });

    return NextResponse.json(
      { ok: false, error: messageForCode(code) },
      { status: statusForCode(code) }
    );
  }
}
