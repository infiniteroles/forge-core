"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

/**
 * Cabecera del Composer: barra compacta y plegable. La descripción larga está
 * oculta por defecto para no ocupar espacio vertical; se despliega con el botón.
 */
export function ComposerHeader() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-m3-outline-variant bg-m3-surface-container-low px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Icon
          name="construction"
          className="text-[22px] leading-none text-m3-primary"
        />
        <h1 className="text-base font-semibold tracking-tight text-m3-on-surface">
          Forge Composer
        </h1>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {open ? (
          <p className="hidden max-w-xl text-xs text-m3-on-surface-variant sm:block">
            Cuéntame qué quieres construir. Haré solo las preguntas
            imprescindibles, propondré la arquitectura y, cuando la confirmes,
            pasaremos al plan y al desarrollo autónomo.
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title={open ? "Ocultar descripción" : "Mostrar descripción"}
          aria-label={open ? "Ocultar descripción" : "Mostrar descripción"}
          aria-expanded={open}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-m3-on-surface-variant transition hover:bg-m3-surface-container-high hover:text-m3-on-surface"
        >
          <Icon
            name={open ? "expand_less" : "expand_more"}
            className="text-[20px] leading-none"
          />
        </button>
      </div>
    </div>
  );
}
