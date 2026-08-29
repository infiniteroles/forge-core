import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { Icon } from "@/components/Icon";
import { TASK_STATUS_LABELS } from "@/lib/task";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!(await getSession())) redirect("/login");

  const [
    total,
    active,
    review,
    taskTotal,
    taskInProgress,
    taskBlocked,
    taskDone,
    recentActivity,
    recentTasks,
  ] = await Promise.all([
    prisma.project.count(),
    prisma.project.count({
      where: { status: { in: ["working", "dev_ready", "deployed_dev"] } },
    }),
    prisma.project.count({ where: { status: "review_needed" } }),
    prisma.task.count(),
    prisma.task.count({ where: { status: "in_progress" } }),
    prisma.task.count({ where: { status: "blocked" } }),
    prisma.task.count({ where: { status: "done" } }),
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.task.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const stats = [
    { label: "Total projects", value: total },
    { label: "Active", value: active },
    { label: "In review", value: review },
  ];

  const taskStats = [
    { label: "Total tasks", value: taskTotal },
    { label: "In progress", value: taskInProgress },
    { label: "Blocked", value: taskBlocked },
    { label: "Completed", value: taskDone },
  ];

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-m3-on-surface">Dashboard</h1>
          <p className="mt-1 text-sm text-m3-on-surface-variant">
            Development control plane for agent-assisted projects.
          </p>
        </div>
        <Link
          href="/projects/new"
          className="flex items-center gap-1.5 rounded-full bg-m3-primary px-4 py-2 text-sm font-medium text-m3-on-primary transition hover:opacity-90"
        >
          <Icon name="add" className="text-[16px] leading-none" /> New project
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-m3-outline-variant bg-m3-surface-container-low p-5"
          >
            <div className="text-3xl font-semibold text-m3-on-surface">
              {stat.value}
            </div>
            <div className="mt-1 text-sm text-m3-on-surface-variant">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {taskStats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-m3-outline-variant bg-m3-surface-container-low p-5"
          >
            <div className="text-2xl font-semibold text-m3-on-surface">
              {stat.value}
            </div>
            <div className="mt-1 text-sm text-m3-on-surface-variant">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-m3-on-surface">Recent tasks</h2>
        <p className="mt-1 text-sm text-m3-on-surface-variant">
          The latest work items across projects.
        </p>
        <div className="mt-5 rounded-2xl border border-m3-outline-variant bg-m3-surface-container-low p-6">
          {recentTasks.length === 0 ? (
            <p className="text-sm text-m3-on-surface-variant">No tasks yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {recentTasks.map((task) => (
                <li
                  key={task.id}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <Link
                    href={`/projects/${task.projectId}`}
                    className="font-medium text-m3-on-surface transition hover:text-m3-primary"
                  >
                    {task.title}
                  </Link>
                  <span className="rounded bg-m3-surface-container-high px-1.5 py-0.5 font-mono text-[11px] text-m3-on-surface-variant">
                    {task.type}
                  </span>
                  <span className="ml-auto text-xs text-m3-on-surface-variant">
                    {TASK_STATUS_LABELS[task.status] ?? task.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-m3-on-surface">Recent activity</h2>
        <p className="mt-1 text-sm text-m3-on-surface-variant">
          Everything important, in one timeline.
        </p>
        <div className="mt-5 rounded-2xl border border-m3-outline-variant bg-m3-surface-container-low p-6">
          <ActivityTimeline activities={recentActivity} />
        </div>
      </div>
    </AppShell>
  );
}
