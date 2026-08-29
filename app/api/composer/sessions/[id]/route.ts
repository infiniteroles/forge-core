import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Borra una conversación del Composer (limpieza; no toca el proyecto). */
export async function DELETE(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const session = await prisma.composerSession.findUnique({ where: { id } });
  if (!session) {
    return NextResponse.json({ error: "Composer session not found" }, { status: 404 });
  }

  await prisma.composerSession.delete({ where: { id } });
  return NextResponse.json({ ok: true, id });
}
