/**
 * Simple task detection (Fase 4.5).
 *
 * A cheap heuristic to recognize trivial tasks that do not need the full
 * Builder pipeline — e.g. "Añadir endpoint GET /api/foo que devuelva {...}".
 * The detector NEVER applies when the request touches anything sensitive or
 * structural (DB, auth, infra, env vars, payments, security, permissions,
 * blocked files). For this phase it only flags + logs; it does not automate
 * the cheap path end-to-end.
 */

const BLOCKED_TERMS = [
  "database",
  "prisma",
  "migrat",
  "auth",
  "login",
  "password",
  "token",
  "secret",
  "api key",
  "environment",
  "env var",
  "infra",
  "deploy",
  "docker",
  "kubernetes",
  "payment",
  "billing",
  "security",
  "permission",
  "role",
  "admin",
  "middleware",
  "webhook",
  "worker",
  "queue",
  "payment",
  "ssl",
  "tls",
  "ssh",
  "firewall",
  "vps",
  "safe-file",
  "safe_file",
  ".env",
  "firebase",
  "stripe",
  "clerk",
];

const ENDPOINT_PATTERN =
  /(?:añadir|add|crear|create|endpoint|route|handler).*(?:GET|POST|PUT|DELETE|PATCH)\s+\/api\/[a-z0-9_-]+/i;

const JSON_PATTERN = /devuelva|return(?:s)?|respond(?:a)?/i;

/** Returns true when the instruction looks like a trivial static API endpoint. */
export function isSimpleApiEndpoint(instruction: string): boolean {
  const text = (instruction ?? "").toLowerCase();
  if (!ENDPOINT_PATTERN.test(text)) return false;
  if (!JSON_PATTERN.test(text)) return false;
  // Denylist: anything that could touch structure/security is NOT simple.
  return !BLOCKED_TERMS.some((t) => text.includes(t));
}
