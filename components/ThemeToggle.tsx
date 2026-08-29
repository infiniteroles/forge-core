"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

/**
 * Modo claro/oscuro de Forge Core. Persiste en localStorage y aplica la clase
 * `.light` en <html> (las variables de tema viven en globals.css).
 */
export function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("forge-theme");
    const isLight = stored === "light";
    setLight(isLight);
    document.documentElement.classList.toggle("light", isLight);
  }, []);

  const toggle = () => {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    localStorage.setItem("forge-theme", next ? "light" : "dark");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={light ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
      aria-label={light ? "Modo oscuro" : "Modo claro"}
      className="grid h-8 w-8 place-items-center rounded-full border border-border bg-surface text-text-dim transition hover:text-neutral-100"
    >
      <Icon
        name={light ? "dark_mode" : "light_mode"}
        className="text-[18px] leading-none"
      />
    </button>
  );
}
