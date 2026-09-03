import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  publishProduct,
  getPublishedStatus,
} from "@/lib/production-publish/publish";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/publish — estado de la publicación del producto
 * (¿publicado? ¿la URL responde?).
 */
export async function GET(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const status = await getPublishedStatus(id);
  return NextResponse.json({ ...status });
}

/**
 * POST /api/projects/[id]/publish — publica el producto en <slug>.dev.core01.io
 * desplegando la rama actual de su primera tarea. El clic del usuario en el
 * Composer ES la confirmación. No mergea a main; no toca Forge Core01.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const result = await publishProduct(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    return NextResponse.json({ ...result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown publish error";
    console.error("publish failed:", err);
    return NextResponse.json(
      { error: `No pude publicar el producto: ${message}` },
      { status: 500 }
    );
  }
}
