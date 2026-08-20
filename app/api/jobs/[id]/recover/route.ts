import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getJobRun, toJobRunPublicData } from "@/lib/jobs/service";
import { recoverJob } from "@/lib/jobs/recovery";

export const runtime = "nodejs";

/**
 * POST /api/jobs/[id]/recover
 *
 * Protected manual-recovery endpoint. Checks the job is recoverable, inspects
 * the real state of its resource, and resumes the job from the correct stage.
 * For production promotions it NEVER repeats the merge once the PR is merged.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const humanEmail = process.env.ADMIN_EMAIL ?? "admin";

  try {
    const result = await recoverJob(id, { humanEmail });
    const job = await getJobRun(id);
    return NextResponse.json({
      ...result,
      job: job ? toJobRunPublicData(job) : null,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error recuperando el job";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
