import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LogoutButton } from "./LogoutButton";
import { ThemeToggle } from "./ThemeToggle";
import { NavLinks } from "./NavLinks";
import { BrandLogo } from "./BrandLogo";
import { Icon } from "./Icon";

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
      <header className="sticky top-0 z-20 border-b border-m3-outline-variant bg-m3-surface-container-low/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 items-center gap-6">
            <Link
              href="/dashboard"
              className="flex shrink-0 items-center"
              aria-label="Forge CORE01 — dashboard"
            >
              <BrandLogo height={30} />
            </Link>
            <NavLinks />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <ThemeToggle />
            <Link
              href="/projects/new"
              className="flex items-center gap-1.5 rounded-full bg-m3-primary px-3.5 py-1.5 text-sm font-medium text-m3-on-primary transition hover:opacity-90"
            >
              <Icon name="add" className="text-[16px] leading-none" /> New project
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
