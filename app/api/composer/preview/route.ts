import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/composer/preview?projectId=... — latest preview deployment for the
 * project linked to a Composer session, so the Composer workspace can render
 * the preview beside the chat.
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
    select: { id: true, status: true, previewUrl: true, error: true },
  });

  return NextResponse.json({ preview: preview ?? null });
}
