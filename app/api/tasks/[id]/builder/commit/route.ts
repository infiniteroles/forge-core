import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { isLLMConfigured, getLLMConfig } from "@/lib/llm/client";
import { LLMError } from "@/lib/llm/types";
import { isGithubConfigured } from "@/lib/github/client";
import { createOrUpdateFiles } from "@/lib/github/files";
import { generateBuilderCommitChanges } from "@/lib/llm/builder-commit";
import { parseBuilderProposalOutput } from "@/lib/llm/builder-proposal";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function commitMessage(operation: "create" | "update", path: string, title: string) {
  const verb = operation === "create" ? "add" : "update";
  const safeTitle = title.replace(/\s+/g, " ").trim().slice(0, 80);
  return `feat(forge-builder): ${verb} ${path} for ${safeTitle}`;
}

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
      {
        ok: false,
        error:
          "Task must belong to a project with a linked repository before running Builder Commit.",
      },
      { status: 400 }
    );
  }

  if (!task.githubBranchName) {
    return NextResponse.json(
      { ok: false, error: "Create a branch before running Builder Commit." },
      { status: 400 }
    );
  }

  if (!task.githubPrNumber) {
    return NextResponse.json(
      { ok: false, error: "Create a draft PR before running Builder Commit." },
      { status: 400 }
    );
  }

  if (!isLLMConfigured()) {
    return NextResponse.json(
      { ok: false, error: "LLM provider is not configured" },
      { status: 503 }
    );
  }

  if (!isGithubConfigured()) {
    return NextResponse.json(
      { ok: false, error: "GitHub token is not configured" },
      { status: 503 }
    );
  }

  // Require a completed Builder Proposal with safe_to_attempt_next = true.
  const proposalRun = await prisma.agentRun.findFirst({
    where: { taskId: task.id, agentName: "builder-proposal", status: "completed" },
    orderBy: { createdAt: "desc" },
  });
  if (!proposalRun) {
    return NextResponse.json(
      { ok: false, error: "Run Builder Proposal before committing changes." },
      { status: 400 }
    );
  }
  const proposal = parseBuilderProposalOutput(proposalRun.output);
  if (!proposal) {
    return NextResponse.json(
      {
        ok: false,
        error: "The Builder Proposal could not be parsed. Run it again.",
      },
      { status: 400 }
    );
  }
  if (proposal.safe_to_attempt_next !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: "Builder Proposal says this is not safe to attempt yet.",
      },
      { status: 400 }
    );
  }

  const run = await prisma.agentRun.create({
    data: {
      projectId: task.projectId,
      taskId: task.id,
      agentName: "builder-commit",
      model: getLLMConfig().model,
      status: "running",
      startedAt: new Date(),
    },
  });

  await logActivity({
    projectId: task.projectId,
    type: "builder.commit.created",
    message: `Builder commit run started for task "${task.title}"`,
    metadata: {
      taskId: task.id,
      agentRunId: run.id,
      repositoryFullName: task.project.repositoryFullName,
      branchName: task.githubBranchName,
    },
  });

  try {
    const result = await generateBuilderCommitChanges(task.id);

    if (result.status === "completed_with_warnings") {
      const output = JSON.stringify({
        status: "completed_with_warnings",
        reason: result.reason,
        violations: result.violations ?? [],
        raw: result.raw ?? null,
      });

      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: "completed_with_warnings",
          output,
          model: result.model ?? undefined,
          finishedAt: new Date(),
        },
      });

      await prisma.task.update({
        where: { id: task.id },
        data: {
          builderLastRunId: run.id,
          builderLastStatus: "completed_with_warnings",
          builderLastSummary: result.reason.slice(0, 300),
        },
      });

      await logActivity({
        projectId: task.projectId,
        type: "builder.commit.completed_with_warnings",
        message: `Builder commit completed with warnings for task "${task.title}"`,
        metadata: {
          taskId: task.id,
          agentRunId: run.id,
          repositoryFullName: task.project.repositoryFullName,
          branchName: task.githubBranchName,
          status: "completed_with_warnings",
        },
      });

      return NextResponse.json({
        ok: true,
        status: "completed_with_warnings",
        reason: result.reason,
        agentRunId: run.id,
      });
    }

    // status === "completed" → apply changes to the task branch.
    const changes = result.changes;
    const commitInputs = changes.files.map((file) => ({
      repositoryFullName: task.project!.repositoryFullName!,
      branchName: task.githubBranchName!,
      path: file.path,
      message: commitMessage(file.operation, file.path, task.title),
      content: file.content,
    }));

    const commits = await createOrUpdateFiles(commitInputs);
    const lastCommit = commits[commits.length - 1];

    await prisma.task.update({
      where: { id: task.id },
      data: {
        githubBuilderCommitSha: lastCommit?.commitSha ?? null,
        githubBuilderCommitUrl: lastCommit?.commitUrl ?? null,
        githubBuilderCommitMessage: lastCommit?.commitMessage ?? null,
        githubBuilderCommittedAt: lastCommit?.committedAt
          ? new Date(lastCommit.committedAt)
          : null,
        githubBuilderLastCheckedAt: new Date(),
        builderLastRunId: run.id,
        builderLastStatus: "completed",
        builderLastSummary: changes.summary.slice(0, 300),
      },
    });

    const output = JSON.stringify({
      summary: changes.summary,
      implementation_notes: changes.implementation_notes,
      files: changes.files,
      validation_plan: changes.validation_plan,
      risks: changes.risks,
      post_commit_notes: changes.post_commit_notes,
      commits,
    });

    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        output,
        model: result.model,
        finishedAt: new Date(),
      },
    });

    await logActivity({
      projectId: task.projectId,
      type: "builder.commit.completed",
      message: `Builder commit created for task "${task.title}"`,
      metadata: {
        taskId: task.id,
        agentRunId: run.id,
        commitSha: lastCommit?.commitSha,
        commitUrl: lastCommit?.commitUrl,
        repositoryFullName: task.project.repositoryFullName,
        branchName: task.githubBranchName,
        filesChanged: changes.files.length,
      },
    });

    return NextResponse.json({
      ok: true,
      status: "completed",
      changes: {
        summary: changes.summary,
        implementation_notes: changes.implementation_notes,
        validation_plan: changes.validation_plan,
        risks: changes.risks,
        post_commit_notes: changes.post_commit_notes,
      },
      commits,
      agentRunId: run.id,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error while running Builder Commit";
    const code = error instanceof LLMError ? error.code : undefined;

    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "failed", output: message, finishedAt: new Date() },
    });

    await logActivity({
      projectId: task.projectId,
      type: "builder.commit.failed",
      message: `Builder commit failed for task "${task.title}"`,
      metadata: {
        taskId: task.id,
        agentRunId: run.id,
        repositoryFullName: task.project.repositoryFullName,
        branchName: task.githubBranchName,
      },
    });

    if (code === "not_configured") {
      return NextResponse.json(
        { ok: false, error: "LLM provider is not configured" },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { ok: false, error: `Builder commit failed: ${message}` },
      { status: 502 }
    );
  }
}
