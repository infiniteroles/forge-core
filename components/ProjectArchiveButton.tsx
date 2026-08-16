"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
      className="rounded-md border border-border px-4 py-2 text-sm text-neutral-300 transition hover:border-red-500/50 hover:text-red-300 disabled:opacity-50"
    >
      {loading ? "Archiving…" : "Archive"}
    </button>
  );
}
