"use client";

import { useEffect, useState } from "react";
import darkLogo from "@/app/res/logo_forge01_darks.png";
import lightLogo from "@/app/res/logo_forge01_ligth.png";

/**
 * Logotipo de Forge CORE01. Cambia la variante según el tema activo
 * (`.light` en <html>): dark theme → logo claro, light theme → logo oscuro.
 */
export function BrandLogo({
  height = 32,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const isLight = () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("light");
    setLight(isLight());
    const obs = new MutationObserver(() => setLight(isLight()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  return (
    <img
      src={(light ? lightLogo : darkLogo).src}
      alt="Forge CORE01"
      height={height}
      style={{ height, width: "auto" }}
      className={`select-none ${className}`}
    />
  );
}
