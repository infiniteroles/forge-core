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
      <div className="h-[calc(100dvh-120px)]">
        {/* La cabecera (plegable + tip) la renderiza ComposerClient */}
        <ComposerClient initialSessionId={session} />
      </div>
    </AppShell>
  );
}
