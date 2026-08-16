"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PROJECT_STATUS_LABELS } from "@/lib/project-status";

type EditableProject = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  devUrl: string | null;
  productionUrl: string | null;
  repoUrl: string | null;
  targetDevDomain: string | null;
  preferredStack: string | null;
  repositoryFullName: string | null;
  notes: string | null;
};

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-neutral-100 placeholder:text-text-dim/60 focus:border-accent/60 focus:outline-none";

const STATUS_OPTIONS = Object.keys(PROJECT_STATUS_LABELS);

export function ProjectEditForm({ project }: { project: EditableProject }) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [slug, setSlug] = useState(project.slug);
  const [description, setDescription] = useState(project.description ?? "");
  const [status, setStatus] = useState(project.status);
  const [devUrl, setDevUrl] = useState(project.devUrl ?? "");
  const [productionUrl, setProductionUrl] = useState(
    project.productionUrl ?? ""
  );
  const [repoUrl, setRepoUrl] = useState(project.repoUrl ?? "");
  const [targetDevDomain, setTargetDevDomain] = useState(
    project.targetDevDomain ?? ""
  );
  const [preferredStack, setPreferredStack] = useState(
    project.preferredStack ?? ""
  );
  const [repositoryFullName, setRepositoryFullName] = useState(
    project.repositoryFullName ?? ""
  );
  const [notes, setNotes] = useState(project.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        slug,
        description,
        status,
        devUrl,
        productionUrl,
        repoUrl,
        targetDevDomain,
        preferredStack,
        repositoryFullName,
        notes,
      }),
    });

    if (res.ok) {
      router.push(`/projects/${project.id}`);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(
        data.error === "Slug already in use"
          ? "Slug already in use"
          : "Could not save the project. Check the fields."
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
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-text-dim" htmlFor="slug">
            Slug
          </label>
          <input
            id="slug"
            className={`${inputClass} font-mono`}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-text-dim" htmlFor="status">
            Status
          </label>
          <select
            id="status"
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option} className="bg-surface">
                {PROJECT_STATUS_LABELS[option] ?? option}
              </option>
            ))}
          </select>
        </div>
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
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-text-dim" htmlFor="devUrl">
            DEV URL
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
          <label className="text-sm text-text-dim" htmlFor="productionUrl">
            Production URL
          </label>
          <input
            id="productionUrl"
            className={inputClass}
            value={productionUrl}
            onChange={(e) => setProductionUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-text-dim" htmlFor="repoUrl">
            Repo URL
          </label>
          <input
            id="repoUrl"
            className={inputClass}
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/…"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-text-dim" htmlFor="targetDevDomain">
            Target DEV domain
          </label>
          <input
            id="targetDevDomain"
            className={inputClass}
            value={targetDevDomain}
            onChange={(e) => setTargetDevDomain(e.target.value)}
            placeholder="app.dev.core01.io"
          />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-text-dim" htmlFor="preferredStack">
            Preferred stack
          </label>
          <input
            id="preferredStack"
            className={inputClass}
            value={preferredStack}
            onChange={(e) => setPreferredStack(e.target.value)}
            placeholder="Next.js + Prisma + PostgreSQL"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-text-dim" htmlFor="repositoryFullName">
            Repository full name
          </label>
          <input
            id="repositoryFullName"
            className={inputClass}
            value={repositoryFullName}
            onChange={(e) => setRepositoryFullName(e.target.value)}
            placeholder="owner/repo"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-text-dim" htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          className={`${inputClass} min-h-20 resize-y`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-border px-4 py-2 text-sm text-neutral-300 transition hover:border-accent/50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
