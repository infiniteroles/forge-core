"use client";

import type { CSSProperties } from "react";

/**
 * Icono Material Symbols (la librería de iconos oficial de Material 3).
 * Uso: <Icon name="add" /> — ver nombres en https://fonts.google.com/icons
 */
export function Icon({
  name,
  className = "",
  filled = false,
  style,
}: {
  name: string;
  className?: string;
  filled?: boolean;
  style?: CSSProperties;
}) {
  const variation: CSSProperties = filled
    ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }
    : {};
  return (
    <span
      aria-hidden
      className={`material-symbols-rounded select-none ${className}`}
      style={{ ...variation, ...style }}
    >
      {name}
    </span>
  );
}
