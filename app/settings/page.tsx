import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!(await getSession())) redirect("/login");

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://forge-app.dev.core01.io";

  const rows: { label: string; value: string }[] = [
    { label: "App name", value: "Forge Core01" },
    { label: "Environment", value: "DEV" },
    { label: "App URL", value: appUrl },
    { label: "Default DEV wildcard", value: "*.dev.core01.io" },
    { label: "GitHub integration", value: "Not configured" },
    { label: "DeepSeek integration", value: "Not configured" },
    { label: "Telegram bot", value: "Not configured" },
    { label: "Coolify API", value: "Not configured" },
  ];

  return (
    <AppShell>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-text-dim">
          Read-only configuration summary for this deployment.
        </p>

        <div className="mt-8 overflow-hidden rounded-xl border border-border bg-surface">
          <dl>
            {rows.map((row, index) => (
              <div
                key={row.label}
                className={`grid grid-cols-1 gap-1 px-6 py-4 sm:grid-cols-2 ${
                  index !== 0 ? "border-t border-border" : ""
                }`}
              >
                <dt className="text-sm text-text-dim">{row.label}</dt>
                <dd className="text-sm text-neutral-100">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </AppShell>
  );
}
