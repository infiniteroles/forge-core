import { TASK_TYPE_LABELS, TASK_PRIORITY_LABELS } from "@/lib/task";

export interface PullRequestTask {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  description: string | null;
  notes: string | null;
  githubBranchName: string | null;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  githubPlanCommitUrl: string | null;
}

export interface PullRequestProject {
  name: string;
}

export function buildPullRequestTitle(taskTitle: string): string {
  return `Draft: ${taskTitle}`;
}

export function buildPullRequestBody(input: {
  task: PullRequestTask;
  project: PullRequestProject;
}): string {
  const { task, project } = input;

  const relatedIssue =
    task.githubIssueNumber != null
      ? `Refs #${task.githubIssueNumber}`
      : "Not linked";

  const lines = [
    "## Forge Task",
    "",
    `**Project:** ${project.name}`,
    `**Task:** ${task.title}`,
    `**Type:** ${TASK_TYPE_LABELS[task.type] ?? task.type}`,
    `**Priority:** ${TASK_PRIORITY_LABELS[task.priority] ?? task.priority}`,
    `**Status in Forge:** ${task.status}`,
    `**Branch:** ${task.githubBranchName ?? "Not linked"}`,
    `**Issue:** ${task.githubIssueUrl ?? "Not linked"}`,
    `**Plan:** ${task.githubPlanCommitUrl ?? "Not created"}`,
    "",
    "## Description",
    "",
    task.description ?? "No description",
    "",
    "## Notes",
    "",
    task.notes ?? "No notes",
    "",
    "## Scope",
    "",
    "This is a draft PR created by Forge Core01.",
    "",
    "Current scope:",
    "- Planning branch created.",
    "- Forge task plan committed under `.forge/tasks/`.",
    "- No production deployment is allowed without manual approval.",
    "",
    "## Related Issue",
    "",
    relatedIssue,
    "",
    "## Forge Metadata",
    "",
    `Task ID: ${task.id}`,
    "Created by: Forge Core01",
  ];

  return lines.join("\n");
}
