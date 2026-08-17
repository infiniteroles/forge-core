import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getSession } from "@/lib/auth";
import { createTaskSchema } from "@/lib/task";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const STATUS_ORDER: Record<string, number> = {
  todo: 0,
  ready: 1,
  in_progress: 2,
  blocked: 3,
  done: 4,
  cancelled: 5,
};

export async function GET(_request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const tasks = await prisma.task.findMany({ where: { projectId: id } });

  tasks.sort((a, b) => {
    return (
      (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99) ||
      a.sortOrder - b.sortOrder ||
      a.createdAt.getTime() - b.createdAt.getTime()
    );
  });

  return NextResponse.json({ tasks });
}

export async function POST(request: NextRequest, { params }: Params) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createTaskSchema.safeParse(body ?? {});

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

  const task = await prisma.task.create({
    data: {
      projectId: id,
      title: data.title,
      description: data.description,
      type: data.type,
      priority: data.priority,
      status: data.status,
      sortOrder: data.sortOrder,
      assignedAgent: data.assignedAgent,
      notes: data.notes,
    },
  });

  await logActivity({
    projectId: id,
    type: "task.created",
    message: "Task created",
    metadata: {
      taskId: task.id,
      type: task.type,
      priority: task.priority,
      status: task.status,
    },
  });

  return NextResponse.json({ task }, { status: 201 });
}
