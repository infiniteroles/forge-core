import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { isGithubConfigured } from "@/lib/github/client";
import { getCommit } from "@/lib/github/files";

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

  if (!task.githubBuilderCommitSha) {
    return NextResponse.json(
      { ok: false, error: "This task has no Builder commit yet." },
      { status: 400 }
    );
  }

  if (!isGithubConfigured()) {
    return NextResponse.json(
      { ok: false, error: "GitHub token is not configured" },
      { status: 503 }
    );
  }

  if (!task.project?.repositoryFullName) {
    return NextResponse.json(
      {
        ok: false,
        error: "Task must belong to a project with a linked repository.",
      },
      { status: 400 }
    );
  }

  try {
    const commit = await getCommit({
      repositoryFullName: task.project.repositoryFullName,
      commitSha: task.githubBuilderCommitSha,
    });

    await prisma.task.update({
      where: { id: task.id },
      data: {
        githubBuilderCommitUrl: commit.url,
        githubBuilderCommitMessage: commit.message || null,
        githubBuilderCommittedAt: commit.committedAt
          ? new Date(commit.committedAt)
          : null,
        githubBuilderLastCheckedAt: new Date(),
      },
    });

    await logActivity({
      projectId: task.projectId,
      type: "builder.commit.checked",
      message: `Builder commit checked for task "${task.title}"`,
      metadata: {
        taskId: task.id,
        commitSha: commit.sha,
        commitUrl: commit.url,
        repositoryFullName: task.project.repositoryFullName,
        branchName: task.githubBranchName,
      },
    });

    return NextResponse.json({ ok: true, commit });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error while checking the commit";
    return NextResponse.json(
      { ok: false, error: `Builder commit check failed: ${message}` },
      { status: 502 }
    );
  }
}
