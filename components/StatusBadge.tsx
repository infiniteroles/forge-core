import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONES,
} from "@/lib/project-status";

export function StatusBadge({ status }: { status: string }) {
  const label = PROJECT_STATUS_LABELS[status] ?? status;
  const tone =
    PROJECT_STATUS_TONES[status] ?? "bg-neutral-700/40 text-neutral-300";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}
    >
      {label}
    </span>
  );
}
