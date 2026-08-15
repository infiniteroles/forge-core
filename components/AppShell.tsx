import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LogoutButton } from "./LogoutButton";

export async function AppShell({ children }: { children: React.ReactNode }) {
  if (!(await getSession())) redirect("/login");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm font-bold text-black">
                F
              </span>
              <span className="font-semibold tracking-tight text-neutral-100">
                Forge Core01
              </span>
            </Link>
            <nav className="hidden items-center gap-5 text-sm text-text-dim sm:flex">
              <Link
                href="/dashboard"
                className="transition hover:text-neutral-100"
              >
                Dashboard
              </Link>
              <Link
                href="/projects"
                className="transition hover:text-neutral-100"
              >
                Projects
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/projects/new"
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black transition hover:opacity-90"
            >
              New project
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
