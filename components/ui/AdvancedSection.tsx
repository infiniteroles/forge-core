import type { ReactNode } from "react";

/**
 * Reusable collapsible "advanced" section (Fase 5.0).
 * Technical detail is hidden by default but stays one click away.
 */
export function AdvancedSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="rounded-lg border border-border bg-surface"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-text-dim transition hover:text-neutral-200">
        <span aria-hidden>▸</span>
        {title}
      </summary>
      <div className="border-t border-border px-4 py-3">{children}</div>
    </details>
  );
}
