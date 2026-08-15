"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-neutral-100 placeholder:text-text-dim/60 focus:border-accent/60 focus:outline-none";

export function ProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [devUrl, setDevUrl] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleName(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug, description, devUrl, repoUrl }),
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/projects/${data.project.id}`);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(
        data.error === "Slug already in use"
          ? "Slug already in use"
          : "Could not create the project. Check the fields."
      );
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-text-dim" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          className={inputClass}
          value={name}
          onChange={(e) => handleName(e.target.value)}
          placeholder="e.g. Forge Core01"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-text-dim" htmlFor="slug">
          Slug
        </label>
        <input
          id="slug"
          className={`${inputClass} font-mono`}
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
          placeholder="forge-core01"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-text-dim" htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          className={`${inputClass} min-h-24 resize-y`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this project about?"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-text-dim" htmlFor="devUrl">
            DEV URL <span className="text-text-dim/50">(optional)</span>
          </label>
          <input
            id="devUrl"
            className={inputClass}
            value={devUrl}
            onChange={(e) => setDevUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-text-dim" htmlFor="repoUrl">
            Repo URL <span className="text-text-dim/50">(optional)</span>
          </label>
          <input
            id="repoUrl"
            className={inputClass}
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/…"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create project"}
        </button>
      </div>
    </form>
  );
}
