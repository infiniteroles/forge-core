import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { ComposerClient } from "@/components/composer/ComposerClient";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ session?: string }> };

export default async function ComposerPage({ searchParams }: Props) {
  if (!(await getSession())) redirect("/login");
  const { session } = await searchParams;

  return (
    <AppShell wide>
      <div className="flex h-[calc(100dvh-120px)] flex-col">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-100">
              Forge Composer
            </h1>
            <p className="mt-0.5 text-sm text-text-dim">
              Cuéntame qué quieres construir. Haré solo las preguntas imprescindibles,
              propondré la arquitectura y, cuando la confirmes, pasaremos al plan y al
              desarrollo autónomo.
            </p>
          </div>
        </div>
        <div className="mt-3 min-h-0 flex-1">
          <ComposerClient initialSessionId={session} />
        </div>
      </div>
    </AppShell>
  );
}
