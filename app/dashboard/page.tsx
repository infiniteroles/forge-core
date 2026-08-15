import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { ActivityTimeline } from "@/components/ActivityTimeline";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!(await getSession())) redirect("/login");

  const [total, active, review, recentActivity] = await Promise.all([
    prisma.project.count(),
    prisma.project.count({
      where: { status: { in: ["working", "dev_ready", "deployed_dev"] } },
    }),
    prisma.project.count({ where: { status: "review_needed" } }),
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const stats = [
    { label: "Total projects", value: total },
    { label: "Active", value: active },
    { label: "In review", value: review },
  ];

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-text-dim">
            Development control plane for agent-assisted projects.
          </p>
        </div>
        <Link
          href="/projects/new"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black transition hover:opacity-90"
        >
          New project
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border bg-surface p-5"
          >
            <div className="text-3xl font-semibold text-neutral-100">
              {stat.value}
            </div>
            <div className="mt-1 text-sm text-text-dim">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Recent activity</h2>
        <p className="mt-1 text-sm text-text-dim">
          Everything important, in one timeline.
        </p>
        <div className="mt-5 rounded-xl border border-border bg-surface p-6">
          <ActivityTimeline activities={recentActivity} />
        </div>
      </div>
    </AppShell>
  );
}
