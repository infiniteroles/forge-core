import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { prepareDevPreview } from "@/lib/coolify/preview";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const session = await prisma.workSession.findUnique({
    where: { id },
    include: { task: true, project: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Work session not found" }, { status: 404 });
  }
  if (!session.task) {
    return NextResponse.json(
      { error: "Work session has no linked task" },
      { status: 409 }
    );
  }

  const task = session.task;
  if (!task.githubBranchName) {
    return NextResponse.json(
      { error: "Task has no branch to preview" },
      { status: 409 }
    );
  }

  await logActivity({
    projectId: session.projectId,
    type: "preview.prepare_requested",
    message: `DEV Preview requested for session "${session.objective.slice(0, 80)}"`,
    metadata: {
      workSessionId: session.id,
      taskId: task.id,
      status: "requested",
    },
  });

  const preview = await prepareDevPreview({
    projectId: session.projectId,
    taskId: task.id,
    workSessionId: session.id,
    repositoryFullName: session.project.repositoryFullName,
    branchName: task.githubBranchName,
    pullRequestNumber: task.githubPrNumber,
    commitSha: task.githubBuilderCommitSha,
  });

  // Persist preview info on the session result so it can be shown on cards.
  const currentResult =
    typeof session.result === "object" && session.result !== null
      ? (session.result as Record<string, unknown>)
      : {};
  await prisma.workSession.update({
    where: { id: session.id },
    data: {
      result: {
        ...currentResult,
        previewId: preview.id,
        previewUrl: preview.previewUrl ?? null,
        previewStatus: preview.status,
      },
    },
  });

  const eventType =
    preview.status === "not_configured"
      ? "preview.not_configured"
      : preview.status === "failed"
        ? "preview.failed"
        : preview.status === "deploying"
          ? "preview.deployment_started"
          : "preview.created";

  const message =
    preview.status === "not_configured"
      ? "DEV Preview is not configured yet."
      : preview.status === "failed"
        ? `DEV Preview failed: ${preview.error ?? "unknown error"}`
        : `DEV Preview ${preview.status === "deploying" ? "deploying" : "ready"}.`;

  await logActivity({
    projectId: session.projectId,
    type: eventType,
    message,
    metadata: {
      previewDeploymentId: preview.id,
      workSessionId: session.id,
      taskId: task.id,
      previewUrl: preview.previewUrl ?? undefined,
      status: preview.status,
      provider: preview.provider,
    },
  });

  if (preview.status === "not_configured") {
    return NextResponse.json(
      {
        ok: false,
        status: "not_configured",
        preview,
        error: preview.error ?? "DEV Preview runner is not configured",
      },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true, preview });
}
