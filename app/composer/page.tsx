import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { ComposerClient } from "@/components/composer/ComposerClient";

export const dynamic = "force-dynamic";

export default async function ComposerPage() {
  if (!(await getSession())) redirect("/login");

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-100">
          Forge Composer
        </h1>
        <p className="mt-1 text-sm text-text-dim">
          Cuéntame qué quieres construir. Haré solo las preguntas imprescindibles,
          propondré la arquitectura y, cuando la confirmes, pasaremos al plan y al
          desarrollo autónomo.
        </p>
        <ComposerClient />
      </div>
    </AppShell>
  );
}
