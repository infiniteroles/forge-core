import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Lista las sesiones del Composer (para el desplegable de retomar). */
export async function GET() {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessions = await prisma.composerSession.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      project: { select: { id: true, name: true, slug: true } },
    },
  });

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      status: s.status,
      updatedAt: s.updatedAt,
      projectId: s.projectId,
      projectName: s.project?.name ?? null,
      projectSlug: s.project?.slug ?? null,
    })),
  });
}
