import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { deleteProjectCompletely } from "@/lib/projects/delete-project";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    confirm?: string;
  } | null;

  if (body?.confirm !== "BORRAR") {
    return NextResponse.json(
      { error: "Confirma con {\"confirm\":\"BORRAR\"} para borrar el proyecto por completo." },
      { status: 400 }
    );
  }

  try {
    const result = await deleteProjectCompletely(id);
    return NextResponse.json(result);
  } catch (err) {
    console.error("delete project failed:", err);
    return NextResponse.json(
      { error: "No se pudo borrar el proyecto por completo." },
      { status: 500 }
    );
  }
}
