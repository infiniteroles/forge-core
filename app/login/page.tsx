"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setError("Invalid email or password.");
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-m3-primary text-base font-bold text-m3-on-primary">
            F
          </span>
          <span className="text-lg font-semibold tracking-tight text-m3-on-surface">
            Forge Core01
          </span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-m3-on-surface">Sign in</h1>
        <p className="mt-1 text-sm text-m3-on-surface-variant">
          Development control plane for agent-assisted projects.
        </p>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
          {error ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-m3-outline-variant bg-m3-error/10 px-3 py-2 text-sm text-m3-error">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-m3-on-surface-variant" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="w-full rounded-xl border border-m3-outline-variant bg-m3-surface-container px-3 py-2 text-sm text-m3-on-surface placeholder:text-m3-on-surface-variant/70 focus:border-m3-primary focus:outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-m3-on-surface-variant" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-xl border border-m3-outline-variant bg-m3-surface-container px-3 py-2 text-sm text-m3-on-surface placeholder:text-m3-on-surface-variant/70 focus:border-m3-primary focus:outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-full bg-m3-primary px-4 py-2.5 text-sm font-semibold text-m3-on-primary transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}
