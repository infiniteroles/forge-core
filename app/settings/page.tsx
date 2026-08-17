import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { getLLMConfig, isLLMConfigured } from "@/lib/llm/client";
import { getGithubConfig, isGithubConfigured } from "@/lib/github/client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!(await getSession())) redirect("/login");

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://forge-app.dev.core01.io";

  const llmConfigured = isLLMConfigured();
  const llmConfig = getLLMConfig();

  const githubConfigured = isGithubConfigured();
  const githubConfig = getGithubConfig();

  const rows: { label: string; value: string }[] = [
    { label: "App name", value: "Forge Core01" },
    { label: "Environment", value: "DEV" },
    { label: "App URL", value: appUrl },
    { label: "Default DEV wildcard", value: "*.dev.core01.io" },
    {
      label: "GitHub integration",
      value: githubConfigured ? "Configured" : "Public only / Not configured",
    },
    {
      label: "Can create issues",
      value: githubConfigured ? "Yes" : "No",
    },
    {
      label: "Can create branches",
      value: githubConfigured ? "Yes" : "No",
    },
    {
      label: "Can create plan commits",
      value: githubConfigured ? "Yes" : "No",
    },
    {
      label: "Can create draft PRs",
      value: githubConfigured ? "Yes" : "No",
    },
    { label: "GitHub API Base URL", value: githubConfig.apiBaseUrl },
    { label: "GitHub Default owner", value: githubConfig.defaultOwner },
    { label: "GitHub token", value: githubConfigured ? "Hidden" : "Not set" },
    {
      label: "DeepSeek integration",
      value: llmConfigured ? "Configured" : "Not configured",
    },
    { label: "DeepSeek model", value: llmConfigured ? llmConfig.model : "Not configured" },
    { label: "DeepSeek base URL", value: llmConfigured ? llmConfig.baseUrl : "Not configured" },
    {
      label: "Builder Proposal Agent",
      value: llmConfigured ? "Available" : "Not configured",
    },
    {
      label: "Builder model",
      value: llmConfigured ? llmConfig.model : "Not configured",
    },
    {
      label: "Builder LLM provider",
      value: llmConfigured ? "Configured" : "Not configured",
    },
    {
      label: "Builder GitHub context",
      value: githubConfigured
        ? "Available"
        : "Public only / Not configured",
    },
    {
      label: "Builder Commit Agent",
      value: llmConfigured && githubConfigured ? "Available" : "Not configured",
    },
    {
      label: "Builder model",
      value: llmConfigured ? llmConfig.model : "Not configured",
    },
    {
      label: "LLM provider",
      value: llmConfigured ? "Configured" : "Not configured",
    },
    {
      label: "GitHub write access",
      value: githubConfigured ? "Available" : "Not configured",
    },
    { label: "Max files per run", value: "5" },
    { label: "Max total change size", value: "120 KB" },
    {
      label: "PR Review Gate",
      value: llmConfigured && githubConfigured ? "Available" : "Not configured",
    },
    {
      label: "PR Review model",
      value: llmConfigured ? llmConfig.model : "Not configured",
    },
    {
      label: "Can mark draft PR ready",
      value: githubConfigured ? "Yes" : "No",
    },
    {
      label: "LLM provider",
      value: llmConfigured ? "Configured" : "Not configured",
    },
    {
      label: "GitHub PR access",
      value: githubConfigured ? "Available" : "Not configured",
    },
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
