import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getCoolifyConfig,
  isCoolifyConfigured,
  checkCoolifyConnection,
  listCoolifyServers,
  listCoolifyProjects,
} from "@/lib/coolify/client";
import { getPreviewRunnerMode } from "@/lib/coolify/preview";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cfg = getCoolifyConfig();
  const configured = isCoolifyConfigured();

  if (!configured) {
    return NextResponse.json({
      ok: false,
      configured: false,
      baseUrl: cfg.baseUrl,
      hasToken: false,
      runnerMode: getPreviewRunnerMode(),
      error: "COOLIFY_API_TOKEN is not configured",
    });
  }

  const connection = await checkCoolifyConnection();

  // Best-effort auto-discovery of server/project UUIDs when not set in env.
  let serverUuid = cfg.serverUuid;
  let projectUuid = cfg.projectUuid;
  let discoveredServer = null;
  let discoveredProject = null;
  let discoveryError: string | null = null;

  if (connection.ok) {
    try {
      if (!serverUuid) {
        const servers = await listCoolifyServers();
        discoveredServer = servers[0] ?? null;
        serverUuid = discoveredServer?.uuid ?? null;
      }
    } catch (error) {
      discoveryError =
        error instanceof Error ? error.message : "Could not list Coolify servers";
    }
    try {
      if (!projectUuid) {
        const projects = await listCoolifyProjects();
        discoveredProject = projects[0] ?? null;
        projectUuid = discoveredProject?.uuid ?? null;
      }
    } catch (error) {
      discoveryError = discoveryError
        ? `${discoveryError}; ${
            error instanceof Error ? error.message : "could not list projects"
          }`
        : error instanceof Error
          ? error.message
          : "Could not list Coolify projects";
    }
  }

  return NextResponse.json({
    ok: connection.ok,
    configured: true,
    baseUrl: cfg.baseUrl,
    hasToken: true,
    runnerMode: getPreviewRunnerMode(),
    connection: connection.ok ? "ok" : "failed",
    version: connection.version ?? undefined,
    connectionError: connection.error ?? undefined,
    serverUuid,
    serverUuidSource: cfg.serverUuid ? "env" : discoveredServer ? "discovered" : "missing",
    projectUuid,
    projectUuidSource: cfg.projectUuid ? "env" : discoveredProject ? "discovered" : "missing",
    environmentName: cfg.environmentName,
    domainSuffix: cfg.domainSuffix,
    defaultPort: cfg.defaultPort,
    buildPack: cfg.buildPack,
    discoveryError: discoveryError ?? undefined,
  });
}
