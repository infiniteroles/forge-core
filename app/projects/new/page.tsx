import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { ProjectForm } from "@/components/ProjectForm";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  if (!(await getSession())) redirect("/login");

  return (
    <AppShell>
      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight">New project</h1>
        <p className="mt-1 text-sm text-text-dim">
          Create a development initiative to start tracking work.
        </p>

        <div className="mt-8 rounded-xl border border-border bg-surface p-6">
          <ProjectForm />
        </div>
      </div>
    </AppShell>
  );
}
