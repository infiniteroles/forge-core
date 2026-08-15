import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createProjectSchema } from "@/lib/validators";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { instructions: true } },
    },
  });
  return NextResponse.json({ projects });
}

export async function POST(request: NextRequest) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createProjectSchema.safeParse(body ?? {});

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const data = parsed.data;

  try {
    const project = await prisma.project.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        devUrl: data.devUrl || null,
        productionUrl: data.productionUrl || null,
        repoUrl: data.repoUrl || null,
      },
    });

    await logActivity({
      projectId: project.id,
      type: "project.created",
      message: `Project "${project.name}" created`,
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("unique constraint")
    ) {
      return NextResponse.json(
        { error: "Slug already in use" },
        { status: 409 }
      );
    }
    throw error;
  }
}
