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
        <h1 className="text-2xl font-semibold tracking-tight text-m3-on-surface">New project</h1>
        <p className="mt-1 text-sm text-m3-on-surface-variant">
          Create a development initiative to start tracking work.
        </p>

        <div className="mt-8 rounded-2xl border border-m3-outline-variant bg-m3-surface-container-low p-6">
          <ProjectForm />
        </div>
      </div>
    </AppShell>
  );
}
