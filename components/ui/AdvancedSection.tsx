import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";

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
      className="group rounded-xl border border-m3-outline-variant bg-m3-surface-container-low"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-m3-on-surface-variant transition hover:text-m3-on-surface">
        <Icon
          name="expand_more"
          className="text-[16px] leading-none transition-transform group-open:rotate-180"
        />
        {title}
      </summary>
      <div className="border-t border-m3-outline-variant px-4 py-3">
        {children}
      </div>
    </details>
  );
}
