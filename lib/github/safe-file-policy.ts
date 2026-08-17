export const BUILDER_MAX_FILES_PER_RUN = 5;
export const BUILDER_MAX_TOTAL_CHANGE_SIZE = 120 * 1024; // 120 KB total per run
export const BUILDER_MAX_SINGLE_FILE_SIZE = 60 * 1024; // 60 KB per file

export interface CommitFileChange {
  path: string;
  operation: "create" | "update" | "delete";
  content: string;
}

export interface SafeFileValidationResult {
  ok: boolean;
  violations: string[];
}

const BLOCKED_PATTERNS: RegExp[] = [
  /^\.env$/,
  /^\.env\..+/,
  /^\.credentials$/,
  /\.pem$/,
  /\.key$/,
  /\.crt$/,
  /\.p12$/,
  /\.pfx$/,
  /\.sqlite$/,
  /\.db$/,
  /^\.github\/workflows\/.*/,
  /^prisma\/migrations\/.*/,
  /^Dockerfile$/,
  /^docker-compose\.ya?ml$/,
  /^docker-compose\..+/,
  /^nginx\/.*/,
  /^caddy\/.*/,
  /^scripts\/deploy.*/,
  /^scripts\/ssh.*/,
];

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip",
  ".gz", ".tar", ".woff", ".woff2", ".ttf", ".eot", ".aiff", ".wav",
  ".mp3", ".mp4", ".mov", ".bin", ".exe", ".dll", ".lock",
]);

function isBinaryPath(path: string): boolean {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot === -1) return false;
  return BINARY_EXTENSIONS.has(lower.slice(dot));
}

function isBlockedPath(path: string): boolean {
  return BLOCKED_PATTERNS.some((p) => p.test(path));
}

/**
 * Validates a set of Builder Commit file changes against the safe-file policy.
 * Returns violations (empty array when ok).
 */
export function validateBuilderCommitChanges(
  files: CommitFileChange[]
): SafeFileValidationResult {
  const violations: string[] = [];

  if (files.length === 0) {
    violations.push("No file changes proposed.");
  }

  if (files.length > BUILDER_MAX_FILES_PER_RUN) {
    violations.push(
      `Too many files (${files.length}). Max ${BUILDER_MAX_FILES_PER_RUN} files per run.`
    );
  }

  let totalBytes = 0;

  for (const file of files) {
    if (!file.path || typeof file.path !== "string") {
      violations.push("A file change is missing a path.");
      continue;
    }

    const path = file.path;

    if (path.startsWith("/")) {
      violations.push(`Absolute paths are not allowed: "${path}"`);
    }
    if (path.split("/").includes("..") || path.includes("..")) {
      violations.push(`Parent path traversal is not allowed: "${path}"`);
    }
    if (isBlockedPath(path)) {
      violations.push(`Path is blocked by policy: "${path}"`);
    }
    if (isBinaryPath(path)) {
      violations.push(`Binary files are not allowed: "${path}"`);
    }

    if (file.operation === "delete") {
      violations.push(`Delete operations are not allowed: "${path}"`);
    }
    if (file.operation !== "create" && file.operation !== "update") {
      violations.push(`Invalid operation "${file.operation}" for "${path}"`);
    }

    if (typeof file.content === "string") {
      const bytes = Buffer.byteLength(file.content, "utf8");
      totalBytes += bytes;
      if (bytes > BUILDER_MAX_SINGLE_FILE_SIZE) {
        violations.push(
          `File too large: "${path}" (${bytes} bytes). Max ${BUILDER_MAX_SINGLE_FILE_SIZE} bytes.`
        );
      }
    } else {
      violations.push(`File "${path}" is missing content.`);
    }
  }

  if (totalBytes > BUILDER_MAX_TOTAL_CHANGE_SIZE) {
    violations.push(
      `Total change size ${totalBytes} bytes exceeds the ${BUILDER_MAX_TOTAL_CHANGE_SIZE} byte limit.`
    );
  }

  return { ok: violations.length === 0, violations };
}

// ── PR diff assessment ───────────────────────────────────────────────────────

export interface PrPathAssessment {
  touchesBlockedPaths: boolean;
  touchesSecrets: boolean;
  touchesInfra: boolean;
  touchesWorkflow: boolean;
  blockedPaths: string[];
  sensitivePaths: string[];
  infraPaths: string[];
  workflowPaths: string[];
}

const SECRET_PATTERNS: RegExp[] = [
  /^\.env$/,
  /^\.env\..+/,
  /^\.credentials$/,
  /\.pem$/,
  /\.key$/,
  /\.crt$/,
  /\.p12$/,
  /\.pfx$/,
];

const INFRA_PATTERNS: RegExp[] = [
  /^Dockerfile$/,
  /^docker-compose\.ya?ml$/,
  /^docker-compose\..+/,
  /^nginx\/.*/,
  /^caddy\/.*/,
  /^scripts\/deploy.*/,
  /^scripts\/ssh.*/,
];

const WORKFLOW_PATTERNS: RegExp[] = [/^\.github\/workflows\/.*/];

function matchesAny(path: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(path));
}

/**
 * Classifies a set of PR changed-file paths against the safe-file policy.
 * Used by the PR Review Gate to flag risky diffs before recommending ready.
 */
export function assessPrPaths(paths: string[]): PrPathAssessment {
  const assessment: PrPathAssessment = {
    touchesBlockedPaths: false,
    touchesSecrets: false,
    touchesInfra: false,
    touchesWorkflow: false,
    blockedPaths: [],
    sensitivePaths: [],
    infraPaths: [],
    workflowPaths: [],
  };

  for (const path of paths) {
    if (!path) continue;
    if (matchesAny(path, SECRET_PATTERNS)) {
      assessment.touchesSecrets = true;
      assessment.sensitivePaths.push(path);
    }
    if (matchesAny(path, INFRA_PATTERNS)) {
      assessment.touchesInfra = true;
      assessment.infraPaths.push(path);
    }
    if (matchesAny(path, WORKFLOW_PATTERNS)) {
      assessment.touchesWorkflow = true;
      assessment.workflowPaths.push(path);
    }
    if (isBlockedPath(path)) {
      assessment.touchesBlockedPaths = true;
      assessment.blockedPaths.push(path);
    }
  }

  return assessment;
}
