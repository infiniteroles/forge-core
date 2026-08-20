import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { getLLMConfig, isLLMConfigured } from "@/lib/llm/client";
import { getGithubConfig, isGithubConfigured } from "@/lib/github/client";
import {
  getSessionCheckRunnerConfig,
  isSessionCheckRunnerEnabled,
  SESSION_CHECK_ALLOWLIST,
} from "@/lib/work-sessions/checks";
import {
  getPreviewRunnerMode,
  getPreviewRunnerConfig,
} from "@/lib/coolify/preview";
import { getCoolifyConfig, isCoolifyConfigured } from "@/lib/coolify/client";
import {
  getPreviewEnvConfig,
  isPreviewEnvKeyForbidden,
  PREVIEW_ENV_DEFAULT_ALLOWED_KEYS,
} from "@/lib/coolify/preview-env-policy";
import {
  getProductionReadinessPolicy,
  PRODUCTION_READINESS_LABELS,
} from "@/lib/production-readiness/policy";
import { CoolifyDiagnostics } from "@/components/CoolifyDiagnostics";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!(await getSession())) redirect("/login");

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://forge-app.dev.core01.io";

  const llmConfigured = isLLMConfigured();
  const llmConfig = getLLMConfig();

  const githubConfigured = isGithubConfigured();
  const githubConfig = getGithubConfig();

  const checksConfig = getSessionCheckRunnerConfig();
  const checksEnabled = isSessionCheckRunnerEnabled();

  const previewMode = getPreviewRunnerMode();
  const previewCfg = getPreviewRunnerConfig();
  const coolifyCfg = getCoolifyConfig();
  const coolifyConfigured = isCoolifyConfigured();
  const previewEnv = getPreviewEnvConfig();
  const productionPolicy = getProductionReadinessPolicy();

  const previewEnvAvailability = PREVIEW_ENV_DEFAULT_ALLOWED_KEYS.map((key) => {
    if (key === "APP_URL" || key === "NEXT_PUBLIC_APP_URL") {
      return { key, status: "generated from preview domain" };
    }
    if (key === "NODE_ENV") {
      return { key, status: previewEnv.nodeEnv };
    }
    const present = Boolean(
      process.env[key] && String(process.env[key]).trim().length > 0
    );
    return { key, status: present ? "available" : "missing" };
  });

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
    {
      label: "Autonomous DEV Work Session",
      value:
        llmConfigured && githubConfigured ? "Available" : "Not configured",
    },
    {
      label: "Work Session mode",
      value:
        "dev (issue → branch → plan → PR → proposal → commit → review) · iteration (Continue / Ask for changes, reutiliza branch y PR)",
    },
    {
      label: "Iteration Loop (Continue / Ask for changes)",
      value:
        llmConfigured && githubConfigured ? "Available" : "Not configured",
    },
    {
      label: "Session Checks",
      value: checksEnabled ? "Available" : "Not configured (runner disabled)",
    },
    {
      label: "Runner mode",
      value: checksConfig.mode === "local" ? "local" : "disabled",
    },
    {
      label: "Allowed commands",
      value: SESSION_CHECK_ALLOWLIST.map((c) => c.command).join(", "),
    },
    {
      label: "Timeout per command",
      value: `${Math.round(checksConfig.timeoutMs / 1000)}s`,
    },
    {
      label: "Max log tail",
      value: `${Math.round(checksConfig.maxTail / 1024)} KB`,
    },
    {
      label: "DEV Preview",
      value:
        previewMode === "disabled"
          ? "Disabled"
          : previewMode === "manual"
            ? "Available (manual)"
            : coolifyConfigured
              ? "Available"
              : "Not configured",
    },
    {
      label: "Preview runner mode",
      value: previewMode,
    },
    {
      label: "Coolify base URL",
      value: coolifyCfg.baseUrl,
    },
    {
      label: "Coolify API token",
      value: coolifyCfg.hasToken ? "Hidden" : "Not set",
    },
    {
      label: "Coolify API",
      value: coolifyConfigured ? "Configured" : "Not configured",
    },
    {
      label: "Preview domain suffix",
      value: coolifyCfg.domainSuffix,
    },
    {
      label: "Default preview provider",
      value: previewMode === "manual" ? "manual" : "coolify",
    },
    {
      label: "Production Readiness Gate",
      value: productionPolicy.gateAvailable
        ? PRODUCTION_READINESS_LABELS.gateAvailable
        : "Not configured",
    },
    {
      label: "Merge automation",
      value: productionPolicy.mergeAutomationEnabled
        ? "Enabled"
        : PRODUCTION_READINESS_LABELS.mergeAutomationEnabled,
    },
    {
      label: "Production deploy automation",
      value: productionPolicy.deployAutomationEnabled
        ? "Enabled"
        : PRODUCTION_READINESS_LABELS.deployAutomationEnabled,
    },
    {
      label: "Approval required",
      value: productionPolicy.approvalRequired
        ? PRODUCTION_READINESS_LABELS.approvalRequired
        : "No",
    },
    { label: "Telegram bot", value: "Not configured" },
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

        <div className="mt-8 rounded-xl border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-dim">
            Coolify Preview Runner
          </h2>
          <p className="mt-1 text-xs text-text-dim">
            DEV Preview runner over the Coolify API. The token is never shown.
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                Runner mode
              </dt>
              <dd className="mt-0.5 text-neutral-100">{previewMode}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                Base URL
              </dt>
              <dd className="mt-0.5 break-all text-neutral-100">
                {previewCfg.baseUrl}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                Token
              </dt>
              <dd className="mt-0.5 text-neutral-100">
                {previewCfg.hasToken ? "Hidden (set)" : "Not set"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                Server UUID
              </dt>
              <dd className="mt-0.5 text-neutral-100">
                {previewCfg.serverUuid ? "set" : "missing"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                Project UUID
              </dt>
              <dd className="mt-0.5 text-neutral-100">
                {previewCfg.projectUuid ? "set" : "missing"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                Environment / domain suffix
              </dt>
              <dd className="mt-0.5 text-neutral-100">
                {previewCfg.environmentName} · {previewCfg.domainSuffix}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                Port / build pack / app prefix
              </dt>
              <dd className="mt-0.5 text-neutral-100">
                {previewCfg.defaultPort} / {previewCfg.buildPack} / {previewCfg.appNamePrefix}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                Deploy timeout
              </dt>
              <dd className="mt-0.5 text-neutral-100">
                {Math.round(previewCfg.deployTimeoutMs / 1000)}s
              </dd>
            </div>
          </dl>
          <div className="mt-4">
            <CoolifyDiagnostics />
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-dim">
            Preview Runtime Environment
          </h2>
          <p className="mt-1 text-xs text-text-dim">
            Env vars injected into preview applications so they can boot. Values
            are never shown; sensitive keys are always blocked.
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                Mode
              </dt>
              <dd className="mt-0.5 font-mono text-neutral-100">{previewEnv.mode}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                Allowed keys
              </dt>
              <dd className="mt-0.5 break-all font-mono text-neutral-100">
                {previewEnv.allowedKeys.join(", ") || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                App URL template
              </dt>
              <dd className="mt-0.5 break-all font-mono text-neutral-100">
                {previewEnv.appUrlTemplate}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                NODE_ENV
              </dt>
              <dd className="mt-0.5 font-mono text-neutral-100">{previewEnv.nodeEnv}</dd>
            </div>
          </dl>

          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-dim">
              Key availability
            </h3>
            <ul className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1 text-xs sm:grid-cols-2">
              {previewEnvAvailability.map(({ key, status }) => (
                <li key={key} className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-neutral-200">{key}</span>
                  <span
                    className={
                      status === "available"
                        ? "text-emerald-300"
                        : status === "missing"
                          ? "text-red-300"
                          : "text-neutral-300"
                    }
                  >
                    {status}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-dim">
              Forbidden sensitive patterns
            </h3>
            <p className="mt-1 break-all font-mono text-xs text-neutral-400">
              {"COOLIFY_API_TOKEN, GITHUB_TOKEN, DEEPSEEK_API_KEY, OPENAI_API_KEY, " +
                "ANTHROPIC_API_KEY, LLM_API_KEY, LLM_REQUEST_TIMEOUT_MS, PRIVATE_KEY, " +
                "SSH_KEY, *_TOKEN, *_PASSWORD, *_SECRET, *.credentials"}
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
