import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { refreshPreviewDeployment } from "@/lib/coolify/preview";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const preview = await prisma.previewDeployment.findUnique({
    where: { id },
    include: { workSession: { select: { id: true } }, task: { select: { id: true } } },
  });
  if (!preview) {
    return NextResponse.json({ error: "Preview deployment not found" }, { status: 404 });
  }

  try {
    const updated = await refreshPreviewDeployment(preview.id);

    await logActivity({
      projectId: preview.projectId,
      type: "preview.refreshed",
      message: `DEV Preview refreshed (${updated.status}).`,
      metadata: {
        previewDeploymentId: preview.id,
        workSessionId: preview.workSessionId ?? undefined,
        taskId: preview.taskId ?? undefined,
        previewUrl: updated.previewUrl ?? undefined,
        status: updated.status,
        provider: updated.provider,
      },
    });

    return NextResponse.json({ ok: true, preview: updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown refresh error";
    return NextResponse.json(
      { ok: false, error: `Refresh failed: ${message}` },
      { status: 502 }
    );
  }
}
