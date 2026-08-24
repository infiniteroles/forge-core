// Fase 6.0 — Composer build: create a new GitHub repository (private, with an
// initial README via auto_init so the default branch exists) so an autonomous
// WorkSession can branch/PR on it.

import { githubFetch, getGithubConfig, isGithubConfigured } from "./client";
import { GithubError } from "./types";

export async function createRepository(input: {
  name: string;
  description?: string;
  owner?: string;
  visibility?: "private" | "public";
}): Promise<{ fullName: string; htmlUrl: string }> {
  if (!isGithubConfigured()) {
    throw new GithubError("GitHub token is not configured", "not_configured");
  }
  const cfg = getGithubConfig();
  const owner = input.owner ?? cfg.defaultOwner;

  const body = {
    name: input.name,
    description: input.description ?? "",
    private: input.visibility !== "public",
    auto_init: true,
  };

  const create = async (path: string) => {
    const res = await githubFetch(path, cfg, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GithubError(
        `GitHub create repository failed (${res.status}): ${text.slice(0, 200)}`,
        "provider_error"
      );
    }
    const data = (await res.json().catch(() => null)) as {
      full_name?: string;
      html_url?: string;
    } | null;
    if (!data?.full_name) {
      throw new GithubError(
        "GitHub create repository: missing full_name",
        "provider_error"
      );
    }
    return {
      fullName: data.full_name,
      htmlUrl: data.html_url ?? `https://github.com/${data.full_name}`,
    };
  };

  try {
    return await create(`/orgs/${encodeURIComponent(owner)}/repos`);
  } catch (orgErr) {
    // Fallback to the token owner's personal account.
    return await create("/user/repos").catch(() => {
      throw orgErr;
    });
  }
}
