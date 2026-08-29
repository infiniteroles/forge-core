"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "space_dashboard" },
  { href: "/composer", label: "Composer", icon: "edit_square" },
  { href: "/projects", label: "Projects", icon: "folder" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

/** Navegación principal con iconos Material Symbols y estado activo por ruta. */
export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 text-sm sm:flex">
      {NAV.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
              active
                ? "bg-m3-primary-container text-m3-on-primary-container"
                : "text-m3-on-surface-variant hover:bg-m3-surface-container-high hover:text-m3-on-surface"
            }`}
          >
            <Icon name={item.icon} className="text-[16px] leading-none" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
