import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { runDiscoveryTurn } from "@/lib/composer/discovery";
import { generateProposal } from "@/lib/composer/proposal";
import { generatePlan } from "@/lib/composer/plan";
import { createComposerProject, startComposerIteration } from "@/lib/composer/build";
import {
  evaluateComposerReadiness,
  formatReadinessChecklist,
  readinessOptions,
  isRepoResolutionIntent,
  githubUrlFromMessage,
} from "@/lib/composer/readiness";
import { agentRoleMeta } from "@/lib/agents/roles";
import type {
  ComposerMessage,
  ComposerMessageKind,
  ComposerSpec,
  ComposerProposal,
  ComposerPlan,
  ComposerStatus,
} from "@/lib/composer/types";

export const dynamic = "force-dynamic";

function nowIso(): string {
  return new Date().toISOString();
}

function msg(
  role: "user" | "assistant",
  kind: ComposerMessageKind,
  content: string
): ComposerMessage {
  return { id: crypto.randomUUID(), role, kind, content, createdAt: nowIso() };
}

function asMessages(v: unknown): ComposerMessage[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (m): m is ComposerMessage =>
      !!m && typeof (m as ComposerMessage).role === "string"
  );
}

/** Retry once on empty LLM responses (DeepSeek hiccups) before giving up. */
async function withLlmRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (
      err instanceof Error &&
      (err as { code?: string }).code === "empty_response"
    ) {
      return await fn();
    }
    throw err;
  }
}

export async function GET(request: NextRequest) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const session = await prisma.composerSession.findUnique({ where: { id } });
  if (!session) {
    return NextResponse.json({ error: "Composer session not found" }, { status: 404 });
  }

  // Deriva la última WorkSession del proyecto para poder retomar el seguimiento
  // (estado, decisiones, avisos de fin de build) tras recargar la página.
  let workSessionId: string | null = null;
  if (session.projectId) {
    const task = await prisma.task.findFirst({
      where: { projectId: session.projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    if (task) {
      const ws = await prisma.workSession.findFirst({
        where: { taskId: task.id },
        orderBy: { createdAt: "desc" },
      });
      workSessionId = ws?.id ?? null;
    }
  }

  return NextResponse.json({
    id: session.id,
    status: session.status,
    messages: asMessages(session.messages),
    spec: (session.spec as ComposerSpec | null) ?? null,
    proposal: (session.proposal as ComposerProposal | null) ?? null,
    plan: (session.plan as ComposerPlan | null) ?? null,
    projectId: session.projectId,
    workSessionId,
    logoUrl: session.logoUrl,
    stylePref: session.stylePref,
  });
}

export async function POST(request: NextRequest) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : null;
  const message =
    typeof body?.message === "string" ? body.message.trim() : "";
  const logo =
    body?.logo && typeof body.logo === "object"
      ? (body.logo as { hasLogo?: boolean; dominantColors?: string[] })
      : null;

  if (!message && !logo) {
    return NextResponse.json(
      { error: "message or logo is required" },
      { status: 400 }
    );
  }

  // Load or create the composer session.
  let session = sessionId
    ? await prisma.composerSession.findUnique({ where: { id: sessionId } })
    : null;
  if (sessionId && !session) {
    return NextResponse.json(
      { error: "Composer session not found" },
      { status: 404 }
    );
  }

  const history = session ? asMessages(session.messages) : [];
  const prevStatus: ComposerStatus =
    (session?.status as ComposerStatus) ?? "discovering";
  if (
    session &&
    ![
      "discovering",
      "proposal",
      "planning",
      "building",
      "preview",
      "done",
    ].includes(session.status)
  ) {
    return NextResponse.json(
      {
        error:
          "La sesión ya está en fase " +
          session.status +
          ". Crea una nueva.",
      },
      { status: 409 }
    );
  }

  // Build the user message.
  const userMsg = logo
    ? msg("user", "logo", (logo.dominantColors ?? []).join(", ") || "true")
    : msg("user", "text", message);
  const latestUserText = logo
    ? `[Logo subido, paleta dominante: ${(logo.dominantColors ?? []).join(", ")}]`
    : message;
  const nextHistory = [...history, userMsg].slice(-24);

  const isAffirmative = (m: string) =>
    /(confirmo|confirmar|apruebo|aprobar|acepto|de acuerdo|perfecto|dale|adelante|vamos|ok|sí|si\b|reintent)/i.test(
      m
    );

  let status: ComposerStatus = prevStatus;
  let spec: ComposerSpec | null =
    (session?.spec as ComposerSpec | null) ?? null;
  let proposal: ComposerProposal | null =
    (session?.proposal as ComposerProposal | null) ?? null;
  let plan: ComposerPlan | null = (session?.plan as ComposerPlan | null) ?? null;
  let projectId: string | null = session?.projectId ?? null;
  let workSessionId: string | null = null;
  let reply = "";
  let kind: ComposerMessageKind = "text";
  let options: string[] | undefined;
  let messages: ComposerMessage[];

  try {
  // Fase 6.5 — iterate by chat: on an already-building project, a chat message
  // is a change request that triggers a new iteration (preview regenerates).
  if (prevStatus !== "discovering" && prevStatus !== "proposal" && prevStatus !== "planning") {
    if (!message) {
      return NextResponse.json(
        { error: "Escribe qué quieres cambiar para lanzar la iteración." },
        { status: 400 }
      );
    }
    if (!projectId) {
      return NextResponse.json(
        { error: "La sesión no tiene proyecto vinculado para iterar." },
        { status: 409 }
      );
    }
    const iterated = await startComposerIteration(projectId, message);
    if (iterated.workSessionId) {
      workSessionId = iterated.workSessionId;
      reply =
        `✅ He lanzado una iteración para: "${message.slice(0, 200)}". ` +
        `Verás el resultado en el preview de la derecha cuando Forge termine (${workSessionId}).`;
      kind = "text";
      messages = [...nextHistory, msg("assistant", "text", reply)];
    } else {
      reply = `⚠️ No pude lanzar la iteración: ${iterated.error ?? "error desconocido"}.`;
      kind = "system";
      messages = [...nextHistory, msg("assistant", "system", reply)];
    }
  } else if (prevStatus === "planning") {
    // ── Resolver las necesidades del proyecto desde el chat ──
    const url = githubUrlFromMessage(message);
    const repoIntent = spec && (isRepoResolutionIntent(message) || !!url);
    const wantsUrl =
      /repo existente|url de repo|usar url/i.test(message) && !url;
    if (repoIntent && spec) {
      if (url) {
        spec = { ...spec, repo: message.trim() };
      } else if (
        /repo nuevo|crear (un )?repo|crea un repo|crear repositorio|nuevo repositorio/i.test(
          message
        )
      ) {
        spec = { ...spec, repo: "new" };
      }
      const r = await evaluateComposerReadiness(spec);
      if (r.ready) {
        reply =
          '✅ Repositorio configurado. Dime **"Confirmo el plan"** y empezaré a construir.';
        kind = "text";
        options = undefined;
      } else {
        reply = formatReadinessChecklist(r);
        kind = "system";
        options = readinessOptions(r, spec);
      }
      messages = [...nextHistory, msg("assistant", kind, reply)];
    } else if (wantsUrl) {
      reply =
        "Perfecto. Pásame la **URL del repositorio** existente (formato: https://github.com/owner/repo).";
      kind = "text";
      messages = [...nextHistory, msg("assistant", "text", reply)];
    } else if (isAffirmative(message)) {
      // Gate: plan aprobado → check previo de necesidades ANTES de arrancar.
      if (spec && proposal) {
        const readiness = await evaluateComposerReadiness(spec);
        const blockers = readiness.items.filter(
          (i) => i.severity === "blocker"
        );
        if (blockers.length > 0) {
          status = "planning";
          reply = formatReadinessChecklist(readiness);
          kind = "system";
          options = readinessOptions(readiness, spec);
        } else {
          try {
            const built = await createComposerProject(spec, proposal, plan);
            projectId = built.projectId;
            workSessionId = built.workSessionId;
            status = "building";
            const repoNote = built.repoFullName
              ? ` He configurado el repositorio ${built.repoFullName}.`
              : "";
            reply =
              `✅ Plan aprobado y proyecto **${spec.name}** creado.${repoNote}` +
              (built.workSessionId
                ? " El build autónomo ya está en marcha."
                : "") +
              " Prepararé la infraestructura y construiré el primer MVP previsualizable para que iteres por chat.";
            kind = "plan";
          } catch (err) {
            const errorMessage =
              err instanceof Error ? err.message : "Error desconocido";
            console.error("composer build failed:", err);
            status = "planning";
            reply =
              `⚠️ No pude crear el repositorio ni arrancar el build: ${errorMessage}. ` +
              `Dime **"Reintentar"** para volver a intentarlo (buscaré otro nombre de repo) ` +
              `o pásame la **URL de un repositorio existente**.`;
            kind = "system";
          }
        }
      } else {
        status = "planning";
        reply =
          "⚠️ Aún no tengo la propuesta necesaria para construir. Confirma la propuesta primero.";
        kind = "system";
      }
      messages = [...nextHistory, msg("assistant", kind, reply)];
    } else {
      // Feedback → regenerate the plan incorporating it.
      plan = await withLlmRetry(() =>
        generatePlan(
          spec ?? { name: "App", purpose: "", auth: "none", uiLibrary: "shadcn" },
          proposal ?? {
            summary: "",
            stack: {
              frontend: "Next.js",
              backend: "Next.js",
              database: "PostgreSQL",
              auth: "Ninguno",
              hosting: "Coolify",
            },
          },
          message
        )
      );
      reply = formatPlan(plan, true);
      kind = "plan";
      messages = [...nextHistory, msg("assistant", "plan", reply)];
    }
  } else if (prevStatus === "proposal" && isAffirmative(message) && spec) {
    // Gate: proposal confirmed → planning (generate the plan).
    const confirmedSpec: ComposerSpec = spec;
    plan = await withLlmRetry(() =>
      generatePlan(confirmedSpec, proposal ?? fallbackProposal())
    );
    status = "planning";
    reply = formatPlan(plan);
    kind = "plan";
    messages = [...nextHistory, msg("assistant", "plan", reply)];
  } else {
    // Discovery turn (or proposal iteration).
    const turn = await withLlmRetry(() =>
      runDiscoveryTurn(history, latestUserText)
    );
    reply = turn.reply;
    kind = turn.kind;
    options = turn.options;
    messages = [...nextHistory, msg("assistant", turn.kind, turn.reply)];
    if (turn.spec) {
      const freshSpec: ComposerSpec = turn.spec;
      spec = freshSpec;
      proposal = await withLlmRetry(() => generateProposal(freshSpec));
      status = "proposal";
      messages.push(msg("assistant", "proposal", formatProposal(proposal)));
    } else {
      status = prevStatus === "proposal" ? "proposal" : "discovering";
    }
  }

  // Fase 6.25 — la paleta se extrae en el cliente (canvas del logo) y llega como
  // dominantColors / session.palette, NO dentro del spec (el LLM del discovery no
  // la conoce). La fusionamos dentro del spec para que spec-resolver
  // (specPalette → accent/background) y el scaffold/builder reciban los colores.
  const requestColors = (logo?.dominantColors ?? []).filter(Boolean) as string[];
  const storedColors = Array.isArray(
    (session as { palette?: unknown } | null)?.palette
  )
    ? (((session as { palette?: string[] } | null)?.palette ?? []).filter(
        (c): c is string => typeof c === "string" && c.length > 0
      ) as string[])
    : [];
  const clientPalette = requestColors.length ? requestColors : storedColors;
  if (spec && clientPalette.length > 0) {
    const specColors = spec.palette?.filter(Boolean) ?? [];
    spec = {
      ...spec,
      palette: specColors.length ? specColors : clientPalette,
      logoStyle: {
        hasLogo: true,
        dominantColors: clientPalette,
        notes: spec.logoStyle?.notes,
      },
    };
  }

  session =
    session ??
    (await prisma.composerSession.create({
      data: { status: "discovering", messages: [] as unknown as Prisma.InputJsonValue },
    }));

  const toJson = (v: unknown): Prisma.InputJsonValue | undefined =>
    v == null ? undefined : (v as unknown as Prisma.InputJsonValue);

  await prisma.composerSession.update({
    where: { id: session.id },
    data: {
      status,
      messages: messages as unknown as Prisma.InputJsonValue,
      spec: toJson(spec) ?? toJson(session.spec),
      proposal: toJson(proposal) ?? toJson(session.proposal),
      plan: toJson(plan) ?? toJson(session.plan),
      projectId: projectId ?? session.projectId,
      logoUrl: logo ? session.logoUrl ?? "uploaded" : session.logoUrl,
      palette: toJson(logo?.dominantColors ?? null) ?? toJson(session.palette),
    },
  });

  return NextResponse.json({
    id: session.id,
    status,
    reply,
    kind,
    options,
    spec,
    proposal,
    plan,
    projectId,
    workSessionId,
    messages,
  });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Error desconocido";
    console.error("composer chat error:", err);
    return NextResponse.json(
      {
        error: `El proveedor LLM devolvió una respuesta inválida (${errorMessage}). Inténtalo de nuevo en unos segundos.`,
      },
      { status: 502 }
    );
  }
}

function fallbackProposal(): ComposerProposal {
  return {
    summary: "",
    stack: {
      frontend: "Next.js",
      backend: "Next.js",
      database: "PostgreSQL",
      auth: "Ninguno",
      hosting: "Coolify",
    },
  };
}

function formatProposal(proposal: ComposerProposal): string {
  return (
    `✅ Propuesta inicial lista:\n\n${proposal.summary}\n\n` +
    `**Frontend**: ${proposal.stack.frontend}\n` +
    `**Backend**: ${proposal.stack.backend}\n` +
    `**Base de datos**: ${proposal.stack.database}\n` +
    `**Auth**: ${proposal.stack.auth}\n` +
    `**Hosting**: ${proposal.stack.hosting}\n\n` +
    (proposal.openQuestions?.length
      ? `Antes de seguir: ${proposal.openQuestions.join("; ")}\n\n`
      : "") +
    `¿Confirmas la propuesta, o quieres ajustar algo?`
  );
}

function formatPlan(plan: ComposerPlan, withFeedback = false): string {
  const lines = [
    withFeedback
      ? "🔄 He ajustado el plan con tu feedback."
      : "✅ Plan de desarrollo y pruebas listo:",
    "",
    plan.summary,
    "",
    `📦 Fases: ${plan.phases.join(" → ")}`,
    "",
  ];

  // Agrupar tareas por fase (las que no tengan fase van en "Tareas").
  const byPhase = new Map<
    string,
    { title: string; description: string; agent?: string }[]
  >();
  for (const t of plan.tasks) {
    const key = (t.phase?.trim() || "Tareas").replace(/^[\d.\s]+/, "");
    const arr = byPhase.get(key) ?? [];
    arr.push({ title: t.title, description: t.description, agent: t.agent });
    byPhase.set(key, arr);
  }
  if (byPhase.size === 0) {
    plan.tasks.forEach((t, i) => lines.push(`${i + 1}. ${t.title} — ${t.description}`));
  } else {
    for (const [phase, tasks] of byPhase) {
      lines.push(`🛠️ ${phase}`);
      tasks.forEach((t, i) => {
        const meta = agentRoleMeta(t.agent);
        lines.push(
          `  ${meta.icon} ${i + 1}. ${t.title}${t.description ? ` — ${t.description}` : ""}`
        );
      });
      lines.push("");
    }
  }

  lines.push("🧪 Pruebas:");
  lines.push(
    plan.testStrategy
      .split("\n")
      .map((l) => `  ${l.trim()}`)
      .join("\n")
  );
  if (plan.risks?.length) {
    lines.push("");
    lines.push("⚠️ Riesgos:");
    plan.risks.forEach((r) => lines.push(`  - ${r}`));
  }
  lines.push("");
  lines.push("¿Apruebas el plan para empezar a construir, o quieres ajustar algo?");
  return lines.join("\n");
}
