import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forge Core01",
  description: "Development control plane for agent-assisted projects.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* Las fuentes (Material Symbols, Geist, Space Grotesk, JetBrains Mono)
          se cargan vía @import en globals.css (evita duplicados e hidratación). */}
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
