import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { refreshPreviewDeployment } from "@/lib/coolify/preview";

export const dynamic = "force-dynamic";

const REFRESH_COOLDOWN_MS = 20_000;

/**
 * GET /api/composer/preview?projectId=... — latest preview deployment for the
 * project linked to a Composer session, so the Composer workspace can render
 * the preview beside the chat.
 *
 * While a Coolify preview is still deploying/queued it syncs the live status
 * from Coolify (with a cooldown) so a failed deploy surfaces as "failed" with a
 * readable error instead of staying "deploying" forever.
 */
export async function GET(request: NextRequest) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const preview = await prisma.previewDeployment.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      previewUrl: true,
      error: true,
      provider: true,
      coolifyDeploymentUuid: true,
      lastCheckedAt: true,
    },
  });

  let effective = preview;
  const inFlight =
    preview?.provider === "coolify" &&
    ["queued", "creating", "deploying"].includes(preview.status) &&
    Boolean(preview.coolifyDeploymentUuid);
  if (inFlight) {
    const stale =
      !preview.lastCheckedAt ||
      Date.now() - preview.lastCheckedAt.getTime() > REFRESH_COOLDOWN_MS;
    if (stale) {
      try {
        effective = await refreshPreviewDeployment(preview.id);
      } catch {
        // keep the current (stale) state on refresh failure
      }
    }
  }

  return NextResponse.json({
    preview: effective
      ? {
          id: effective.id,
          status: effective.status,
          previewUrl: effective.previewUrl,
          error: effective.error,
        }
      : null,
  });
}
