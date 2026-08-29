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
      {/* Material Symbols — librería de iconos de Material 3 (Next lo sube a <head>) */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
      />
      <body className="min-h-screen bg-background font-sans text-neutral-100">
        {children}
      </body>
    </html>
  );
}
