import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { prisma } from "@/lib/db";

// ── Allowlist ────────────────────────────────────────────────────────────────
// Closed list of commands Forge is allowed to run as session checks. NEVER
// derived from user input or from the model. Keep it small and safe.

export interface SessionCheckDefinition {
  name: string;
  command: string; // display form, e.g. "npm run lint"
  bin: string; // executable: "npm" | "npx" (no shell)
  argv: string[]; // spawn argv (no shell)
}

export const SESSION_CHECK_ALLOWLIST: SessionCheckDefinition[] = [
  { name: "lint", command: "npm run lint", bin: "npm", argv: ["run", "lint"] },
  { name: "build", command: "npm run build", bin: "npm", argv: ["run", "build"] },
  { name: "prisma validate", command: "npx prisma validate", bin: "npx", argv: ["prisma", "validate"] },
];

export const SESSION_CHECK_STATUSES = [
  "queued",
  "running",
  "passed",
  "failed",
  "skipped",
  "cancelled",
  "timeout",
] as const;

export type SessionCheckStatus = (typeof SESSION_CHECK_STATUSES)[number];

export interface SessionChecksSummary {
  status: "passed" | "failed" | "skipped";
  summary: string;
  checks: { name: string; status: SessionCheckStatus }[];
}

// ── Configuration ────────────────────────────────────────────────────────────

export interface SessionCheckRunnerConfig {
  mode: "local" | "disabled";
  timeoutMs: number;
  maxTail: number;
}

/**
 * Runner configuration. Controlled by environment only — never by the user or
 * the model. `SESSION_CHECKS_RUNNER=local` enables the real runner; anything
 * else (default) keeps it disabled → checks are recorded as skipped.
 */
export function getSessionCheckRunnerConfig(): SessionCheckRunnerConfig {
  const mode = process.env.SESSION_CHECKS_RUNNER === "local" ? "local" : "disabled";
  const timeoutMsRaw = Number(process.env.SESSION_CHECKS_TIMEOUT_MS ?? "");
  const maxTailRaw = Number(process.env.SESSION_CHECKS_MAX_TAIL ?? "");
  return {
    mode,
    timeoutMs: Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 120_000,
    maxTail: Number.isFinite(maxTailRaw) && maxTailRaw > 0 ? maxTailRaw : 8 * 1024,
  };
}

export function isSessionCheckRunnerEnabled(): boolean {
  return getSessionCheckRunnerConfig().mode === "local";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function tail(text: string, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(-max) : text;
}

function runCommand(
  bin: string,
  argv: string[],
  cwd: string,
  timeoutMs: number,
  maxTail: number
): Promise<{ exitCode: number; stdoutTail: string; stderrTail: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(bin, argv, {
      cwd,
      shell: false,
      env: { ...process.env, FORGE_SESSION_CHECKS: "1" },
    });

    let stdout = "";
    let stderr = "";
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill("SIGKILL");
      resolve({ exitCode: -1, stdoutTail: tail(stdout, maxTail), stderrTail: tail(stderr, maxTail), timedOut: true });
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ exitCode: -1, stdoutTail: tail(stdout, maxTail), stderrTail: tail(stderr, maxTail) + `\n${err.message}`, timedOut: false });
    });
    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ exitCode: code ?? -1, stdoutTail: tail(stdout, maxTail), stderrTail: tail(stderr, maxTail), timedOut: false });
    });
  });
}

function runGit(
  argv: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", argv, { cwd, shell: false });
    let stderr = "";
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill("SIGKILL");
      resolve({ exitCode: -1, stderr: "git timeout" });
    }, timeoutMs);
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ exitCode: -1, stderr: err.message });
    });
    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ exitCode: code ?? -1, stderr });
    });
  });
}

// ── Runner ───────────────────────────────────────────────────────────────────

async function runRealChecks(input: {
  workSessionId: string;
  projectId: string;
  taskId: string;
  repositoryFullName: string;
  branchName: string;
}): Promise<SessionChecksSummary> {
  const cfg = getSessionCheckRunnerConfig();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-checks-"));

  const record: { name: string; status: SessionCheckStatus }[] = [];

  try {
    // Public clone URL only. Never embed credentials/tokens in the URL.
    const repoUrl = `https://github.com/${input.repositoryFullName}.git`;
    const clone = await runGit(
      ["clone", "--depth", "1", "--branch", input.branchName, repoUrl, tmpDir],
      os.tmpdir(),
      120_000
    );
    if (clone.exitCode !== 0) {
      const summary =
        clone.stderr.includes("Authentication failed") ||
        clone.stderr.includes("could not read Username")
          ? "Could not clone the repository (private repo or no access). Checks skipped."
          : "Could not clone the repository from the task branch. Checks skipped.";
      for (const def of SESSION_CHECK_ALLOWLIST) {
        await prisma.sessionCheck.create({
          data: {
            workSessionId: input.workSessionId,
            projectId: input.projectId,
            taskId: input.taskId,
            name: def.name,
            command: def.command,
            status: "skipped",
            summary,
            startedAt: new Date(),
            finishedAt: new Date(),
            durationMs: 0,
          },
        });
        record.push({ name: def.name, status: "skipped" });
      }
      return { status: "skipped", summary, checks: record };
    }

    // Install dependencies (bounded). If this is too slow/unavailable we treat
    // it as a failure of the whole check batch but still report per-command.
    const ci = await runCommand("npm", ["ci"], tmpDir, cfg.timeoutMs, cfg.maxTail);
    if (ci.exitCode !== 0 && ci.timedOut) {
      const summary = "npm ci timed out. Checks skipped.";
      for (const def of SESSION_CHECK_ALLOWLIST) {
        await prisma.sessionCheck.create({
          data: {
            workSessionId: input.workSessionId,
            projectId: input.projectId,
            taskId: input.taskId,
            name: def.name,
            command: def.command,
            status: "skipped",
            summary,
            startedAt: new Date(),
            finishedAt: new Date(),
            durationMs: 0,
          },
        });
        record.push({ name: def.name, status: "skipped" });
      }
      return { status: "skipped", summary, checks: record };
    }

    let anyFailed = false;
    for (const def of SESSION_CHECK_ALLOWLIST) {
      const startedAt = new Date();
      const row = await prisma.sessionCheck.create({
        data: {
          workSessionId: input.workSessionId,
          projectId: input.projectId,
          taskId: input.taskId,
          name: def.name,
          command: def.command,
          status: "running",
          startedAt,
        },
      });

      const res = await runCommand(def.bin, def.argv, tmpDir, cfg.timeoutMs, cfg.maxTail);
      const finishedAt = new Date();
      const status: SessionCheckStatus =
        res.timedOut
          ? "timeout"
          : res.exitCode === 0
            ? "passed"
            : "failed";
      if (status !== "passed") anyFailed = true;

      const summary = res.timedOut
        ? `Command timed out after ${Math.round(cfg.timeoutMs / 1000)}s.`
        : res.exitCode === 0
          ? "OK"
          : `Command failed with exit code ${res.exitCode}.`;

      await prisma.sessionCheck.update({
        where: { id: row.id },
        data: {
          status,
          exitCode: res.exitCode === -1 ? null : res.exitCode,
          summary,
          stdoutTail: res.stdoutTail || null,
          stderrTail: res.stderrTail || null,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
        },
      });
      record.push({ name: def.name, status });
    }

    return {
      status: anyFailed ? "failed" : "passed",
      summary: anyFailed
        ? "Some session checks failed. Review the details before continuing."
        : "Session checks passed (lint, build, prisma validate).",
      checks: record,
    };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

/**
 * Runs the lightweight session checks for a work session. When the runner is
 * not configured (default) it records every allowlist command as `skipped` with
 * a clear explanation and never blocks the session. Returns a short summary.
 */
export async function runSessionChecks(
  workSessionId: string
): Promise<SessionChecksSummary> {
  const ws = await prisma.workSession.findUnique({
    where: { id: workSessionId },
    include: { task: true, project: true },
  });
  if (!ws || !ws.task || !ws.project) {
    throw new Error("Work session not found or has no task/project");
  }

  const task = ws.task;
  const cfg = getSessionCheckRunnerConfig();
  const record: { name: string; status: SessionCheckStatus }[] = [];

  const projectId = ws.projectId;
  const taskId = task.id;

  // Decide whether we can/should run.
  let skipReason: string | null = null;
  if (cfg.mode === "disabled") {
    skipReason =
      "Check runner not configured yet (SESSION_CHECKS_RUNNER=disabled). Checks skipped.";
  } else if (!ws.project.repositoryFullName) {
    skipReason = "Project has no linked repository. Checks skipped.";
  } else if (!task.githubBranchName) {
    skipReason = "Task has no branch yet. Checks skipped.";
  } else if (!task.githubBuilderCommitSha) {
    skipReason = "No Builder commit on this task yet. Checks skipped.";
  }

  if (skipReason) {
    for (const def of SESSION_CHECK_ALLOWLIST) {
      await prisma.sessionCheck.create({
        data: {
          workSessionId,
          projectId,
          taskId,
          name: def.name,
          command: def.command,
          status: "skipped",
          summary: skipReason,
          startedAt: new Date(),
          finishedAt: new Date(),
          durationMs: 0,
        },
      });
      record.push({ name: def.name, status: "skipped" });
    }
    return { status: "skipped", summary: skipReason, checks: record };
  }

  return runRealChecks({
    workSessionId,
    projectId,
    taskId,
    repositoryFullName: ws.project.repositoryFullName!,
    branchName: task.githubBranchName!,
  });
}

/**
 * Best-effort compact summary of a session's checks, for the UI/human summary.
 */
export async function getSessionChecksSummary(
  workSessionId: string
): Promise<{ status: string; summary: string | null; count: number } | null> {
  const checks = await prisma.sessionCheck.findMany({
    where: { workSessionId },
    orderBy: { createdAt: "asc" },
  });
  if (checks.length === 0) return null;

  const failed = checks.some((c) => c.status === "failed" || c.status === "timeout");
  const skipped = checks.every((c) => c.status === "skipped");
  const passed = !failed && !skipped;

  let status: string;
  if (failed) status = "failed";
  else if (skipped) status = "skipped";
  else status = "passed";

  const failedNames = checks
    .filter((c) => c.status === "failed" || c.status === "timeout")
    .map((c) => c.name);
  const summary = failed
    ? `Session checks failed: ${failedNames.join(", ")}`
    : skipped
      ? "Session checks skipped (runner not configured)"
      : "Session checks passed";

  return { status, summary, count: checks.length };
}
