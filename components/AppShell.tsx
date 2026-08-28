import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LogoutButton } from "./LogoutButton";
import { ThemeToggle } from "./ThemeToggle";

export async function AppShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!(await getSession())) redirect("/login");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
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
                href="/composer"
                className="text-accent transition hover:text-neutral-100"
              >
                Composer
              </Link>
              <Link
                href="/projects"
                className="transition hover:text-neutral-100"
              >
                Projects
              </Link>
              <Link
                href="/settings"
                className="transition hover:text-neutral-100"
              >
                Settings
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
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
      <main className={wide ? "px-4 py-6" : "mx-auto max-w-6xl px-6 py-10"}>
        {children}
      </main>
    </div>
  );
}
