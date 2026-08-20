import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

export async function POST(request: NextRequest, { params }: Params) {
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

  const body = await request.json().catch(() => null);
  const previewUrl =
    typeof body?.previewUrl === "string" ? body.previewUrl.trim() : "";

  if (!previewUrl) {
    return NextResponse.json(
      { ok: false, error: "previewUrl is required" },
      { status: 400 }
    );
  }
  if (!URL_REGEX.test(previewUrl) || previewUrl.length > 500) {
    return NextResponse.json(
      { ok: false, error: "previewUrl must be a valid http(s) URL" },
      { status: 400 }
    );
  }

  let domain: string | null = null;
  try {
    domain = new URL(previewUrl).host;
  } catch {
    domain = null;
  }

  // Reuse an existing preview for this session, or create a manual one.
  const existing = await prisma.previewDeployment.findFirst({
    where: { workSessionId: session.id, projectId: session.projectId },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const preview = existing
    ? await prisma.previewDeployment.update({
        where: { id: existing.id },
        data: {
          provider: "manual",
          status: "ready",
          previewUrl,
          domain,
          branchName: session.task.githubBranchName,
          repositoryFullName: session.project.repositoryFullName,
          pullRequestNumber: session.task.githubPrNumber,
          commitSha: session.task.githubBuilderCommitSha,
          error: null,
          deployedAt: existing.deployedAt ?? now,
          requestedAt: existing.requestedAt ?? now,
          lastCheckedAt: now,
        },
      })
    : await prisma.previewDeployment.create({
        data: {
          projectId: session.projectId,
          taskId: session.task.id,
          workSessionId: session.id,
          provider: "manual",
          status: "ready",
          previewUrl,
          domain,
          branchName: session.task.githubBranchName,
          repositoryFullName: session.project.repositoryFullName,
          pullRequestNumber: session.task.githubPrNumber,
          commitSha: session.task.githubBuilderCommitSha,
          requestedAt: now,
          deployedAt: now,
          lastCheckedAt: now,
        },
      });

  // Persist preview info on the session result.
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
        previewUrl,
        previewStatus: "ready",
      },
    },
  });

  await logActivity({
    projectId: session.projectId,
    type: "preview.manual_registered",
    message: "Manual DEV Preview URL registered.",
    metadata: {
      previewDeploymentId: preview.id,
      workSessionId: session.id,
      taskId: session.task.id,
      previewUrl,
      status: "ready",
      provider: "manual",
    },
  });

  return NextResponse.json({ ok: true, preview });
}
