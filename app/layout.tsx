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
      <body className="min-h-screen bg-background font-sans text-neutral-100">
        {children}
      </body>
    </html>
  );
}
