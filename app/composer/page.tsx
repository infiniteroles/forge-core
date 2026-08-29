import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { ComposerClient } from "@/components/composer/ComposerClient";
import { ComposerHeader } from "@/components/composer/ComposerHeader";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ session?: string }> };

export default async function ComposerPage({ searchParams }: Props) {
  if (!(await getSession())) redirect("/login");
  const { session } = await searchParams;

  return (
    <AppShell wide>
      <div className="flex h-[calc(100dvh-120px)] flex-col">
        <ComposerHeader />
        <div className="mt-3 min-h-0 flex-1">
          <ComposerClient initialSessionId={session} />
        </div>
      </div>
    </AppShell>
  );
}
