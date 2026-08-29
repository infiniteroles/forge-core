"use client";

import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      title="Cerrar sesión"
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-m3-on-surface-variant transition hover:bg-m3-surface-container-high hover:text-m3-on-surface"
    >
      <Icon name="logout" className="text-[16px] leading-none" />
      <span className="hidden sm:inline">Log out</span>
    </button>
  );
}
