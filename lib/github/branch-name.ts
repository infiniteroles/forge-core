/**
 * Safe branch-name generation for Forge tasks.
 *
 * Format: `forge/issue-<n>-<slug>` when the task has a GitHub issue, otherwise
 * `forge/task-<shortId>-<slug>`. Collisions are resolved by suffixing `-2`,
 * `-3`, … up to a reasonable limit.
 */

const MAX_SLUG_LENGTH = 40;
const MAX_VARIANTS = 20;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/^-+|-+$/g, "");
}

export interface BranchNameTask {
  id: string;
  title: string;
  githubIssueNumber: number | null;
}

export function buildBranchBaseName(task: BranchNameTask): string {
  const slug = slugify(task.title) || "task";

  if (task.githubIssueNumber) {
    return `forge/issue-${task.githubIssueNumber}-${slug}`;
  }

  const shortId = task.id.slice(0, 6).toLowerCase();
  return `forge/task-${shortId}-${slug}`;
}

export function generateBranchNameCandidates(
  task: BranchNameTask,
  maxVariants: number = MAX_VARIANTS
): string[] {
  const base = buildBranchBaseName(task);
  const names: string[] = [base];
  for (let i = 2; i <= maxVariants; i += 1) {
    names.push(`${base}-${i}`);
  }
  return names;
}
