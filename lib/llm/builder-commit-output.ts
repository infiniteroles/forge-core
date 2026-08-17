import { z } from "zod";

export const builderCommitStoredOutputSchema = z.object({
  summary: z.string().optional(),
  implementation_notes: z.string().optional(),
  files: z
    .array(
      z.object({
        path: z.string(),
        operation: z.string(),
        reason: z.string().optional(),
        content: z.string().optional(),
      })
    )
    .optional(),
  validation_plan: z
    .array(
      z.object({
        command: z.string(),
        purpose: z.string(),
      })
    )
    .optional(),
  risks: z.array(z.string()).optional(),
  post_commit_notes: z.array(z.string()).optional(),
  commits: z
    .array(
      z.object({
        path: z.string(),
        commitSha: z.string(),
        commitUrl: z.string(),
        commitMessage: z.string(),
        committedAt: z.string().nullable(),
        updated: z.boolean(),
      })
    )
    .optional(),
});

export type BuilderCommitStoredOutput = z.infer<
  typeof builderCommitStoredOutputSchema
>;

/**
 * Best-effort parse of a stored Builder Commit AgentRun output (for UI and
 * context building).
 */
export function parseBuilderCommitOutput(
  raw: string | null | undefined
): BuilderCommitStoredOutput | null {
  if (!raw) return null;
  try {
    return builderCommitStoredOutputSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}
