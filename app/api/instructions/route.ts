import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createInstructionSchema } from "@/lib/validators";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createInstructionSchema.safeParse(body ?? {});

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

  const project = await prisma.project.findUnique({
    where: { id: data.projectId },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const instruction = await prisma.instruction.create({
    data: {
      projectId: data.projectId,
      content: data.content,
      source: data.source,
    },
  });

  await logActivity({
    projectId: project.id,
    type: "instruction.created",
    message: `Instruction added to "${project.name}"`,
  });

  return NextResponse.json({ instruction }, { status: 201 });
}
