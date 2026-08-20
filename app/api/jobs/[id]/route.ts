import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getJobRun, toJobRunPublicData } from "@/lib/jobs/service";

export const runtime = "nodejs";

/**
 * GET /api/jobs/[id]
 *
 * Protected job-status endpoint. Returns the safe public shape of a JobRun —
 * progress, stage, summary, error, timestamps. Never returns secrets.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const job = await getJobRun(id);
  if (!job) {
    return NextResponse.json({ error: "No existe el job indicado." }, { status: 404 });
  }

  return NextResponse.json({ job: toJobRunPublicData(job) });
}
