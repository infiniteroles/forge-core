import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateProjectSchema } from "@/lib/validators";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      instructions: { orderBy: { createdAt: "desc" } },
      agentRuns: { orderBy: { createdAt: "desc" }, take: 20 },
      activityLogs: { orderBy: { createdAt: "desc" }, take: 50 },
      environments: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ project });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateProjectSchema.safeParse(body ?? {});

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

  const project = await prisma.project.update({
    where: { id },
    data: {
      name: data.name,
      slug: data.slug,
      description: data.description ?? undefined,
      devUrl: data.devUrl ?? undefined,
      productionUrl: data.productionUrl ?? undefined,
      repoUrl: data.repoUrl ?? undefined,
    },
  });

  await logActivity({
    projectId: project.id,
    type: "project.updated",
    message: `Project "${project.name}" updated`,
  });

  return NextResponse.json({ project });
}
