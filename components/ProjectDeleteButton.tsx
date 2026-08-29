"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

/**
 * Borra un proyecto COMPLETO (BD + repo GitHub + previews Coolify) para
 * liberar recursos. Es destructivo: exige escribir "BORRAR" para confirmar.
 */
export function ProjectDeleteButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    const typed = window.prompt(
      `Borrar el proyecto "${projectName}" por completo?\n\n` +
        `Esto elimina: el proyecto, sus tareas/sesiones/previews/promociones de la BD, ` +
        `el repositorio de GitHub (si está vinculado) y las apps preview de Coolify. ` +
        `NO se puede deshacer.\n\n` +
        `Escribe BORRAR para confirmar:`
    );
    if (typed !== "BORRAR") {
      if (typed !== null) window.alert("Cancelado: escribe BORRAR para confirmar.");
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/projects/${projectId}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "BORRAR" }),
    });

    if (res.ok) {
      router.push("/projects");
      router.refresh();
    } else {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      window.alert(data?.error ?? "No se pudo borrar el proyecto.");
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-full border border-m3-error/50 px-4 py-2 text-sm text-m3-error transition hover:bg-m3-error/10 disabled:opacity-50"
    >
      <Icon name="delete" className="text-[16px] leading-none" />
      {loading ? "Borrando…" : "Borrar proyecto"}
    </button>
  );
}
