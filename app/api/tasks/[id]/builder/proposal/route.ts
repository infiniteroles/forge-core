import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { runBuilderProposalAgent } from "@/lib/llm/builder-proposal";
import { isLLMConfigured, getLLMConfig } from "@/lib/llm/client";
import { LLMError } from "@/lib/llm/types";

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

  if (!isLLMConfigured()) {
    return NextResponse.json(
      { ok: false, error: "LLM provider is not configured" },
      { status: 503 }
    );
  }

  if (!task.project?.repositoryFullName) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Task must belong to a project with a linked repository before requesting a builder proposal.",
      },
      { status: 400 }
    );
  }

  const run = await prisma.agentRun.create({
    data: {
      projectId: task.projectId,
      taskId: task.id,
      agentName: "builder-proposal",
      model: getLLMConfig().model,
      status: "running",
      startedAt: new Date(),
    },
  });

  await logActivity({
    projectId: task.projectId,
    type: "builder.proposal.created",
    message: `Builder proposal requested for task "${task.title}"`,
    metadata: {
      taskId: task.id,
      agentRunId: run.id,
      model: getLLMConfig().model,
      repositoryFullName: task.project.repositoryFullName,
      branchName: task.githubBranchName,
    },
  });

  try {
    const result = await runBuilderProposalAgent(task.id);

    const output =
      result.status === "completed"
        ? JSON.stringify(result.output)
        : result.raw;

    const updated = await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: result.status,
        output,
        model: result.model,
        finishedAt: new Date(),
      },
    });

    await logActivity({
      projectId: task.projectId,
      type: "builder.proposal.completed",
      message:
        result.status === "completed"
          ? `Builder proposal ready for task "${task.title}"`
          : `Builder proposal completed with warnings for task "${task.title}"`,
      metadata: {
        taskId: task.id,
        agentRunId: run.id,
        model: result.model,
        repositoryFullName: task.project.repositoryFullName,
        branchName: task.githubBranchName,
        status: result.status,
      },
    });

    return NextResponse.json({ ok: true, agentRun: updated });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error while running the builder proposal";
    const code = error instanceof LLMError ? error.code : undefined;

    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        output: message,
        finishedAt: new Date(),
      },
    });

    await logActivity({
      projectId: task.projectId,
      type: "builder.proposal.failed",
      message: `Builder proposal failed for task "${task.title}"`,
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

    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
