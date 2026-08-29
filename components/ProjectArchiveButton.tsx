"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

export function ProjectArchiveButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onArchive() {
    if (
      !window.confirm(
        `Archive "${projectName}"? It will be marked as paused.`
      )
    ) {
      return;
    }

    setLoading(true);

    const res = await fetch(`/api/projects/${projectId}/archive`, {
      method: "POST",
    });

    if (res.ok) {
      router.refresh();
    } else {
      window.alert("Could not archive the project.");
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onArchive}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-full border border-m3-outline-variant px-4 py-2 text-sm text-m3-on-surface-variant transition hover:bg-m3-surface-container-high hover:text-m3-on-surface disabled:opacity-50"
    >
      <Icon name="archive" className="text-[16px] leading-none" />
      {loading ? "Archiving…" : "Archive"}
    </button>
  );
}
