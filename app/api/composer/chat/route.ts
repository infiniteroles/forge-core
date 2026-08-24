import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { runDiscoveryTurn } from "@/lib/composer/discovery";
import { generateProposal } from "@/lib/composer/proposal";
import { generatePlan } from "@/lib/composer/plan";
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
  return NextResponse.json({
    id: session.id,
    status: session.status,
    messages: asMessages(session.messages),
    spec: (session.spec as ComposerSpec | null) ?? null,
    proposal: (session.proposal as ComposerProposal | null) ?? null,
    plan: (session.plan as ComposerPlan | null) ?? null,
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
    !["discovering", "proposal", "planning"].includes(session.status)
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
    /(confirmo|confirmar|apruebo|aprobar|acepto|de acuerdo|perfecto|dale|adelante|vamos|ok|sí|si\b)/i.test(
      m
    );

  let status: ComposerStatus = prevStatus;
  let spec: ComposerSpec | null =
    (session?.spec as ComposerSpec | null) ?? null;
  let proposal: ComposerProposal | null =
    (session?.proposal as ComposerProposal | null) ?? null;
  let plan: ComposerPlan | null = (session?.plan as ComposerPlan | null) ?? null;
  let reply = "";
  let kind: ComposerMessageKind = "text";
  let options: string[] | undefined;
  let messages: ComposerMessage[];

  if (prevStatus === "planning" && isAffirmative(message)) {
    // Gate: plan approved → building.
    status = "building";
    reply =
      "✅ Plan aprobado. Pasamos a la fase de desarrollo autónomo: prepararé el repositorio, la infraestructura y construiré el MVP para que puedas previsualizarlo e iterar por chat.";
    kind = "plan";
    messages = [...nextHistory, msg("assistant", "plan", reply)];
  } else if (prevStatus === "planning") {
    // Feedback → regenerate the plan incorporating it.
    plan = await generatePlan(
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
    );
    reply = formatPlan(plan, true);
    kind = "plan";
    messages = [...nextHistory, msg("assistant", "plan", reply)];
  } else if (prevStatus === "proposal" && isAffirmative(message) && spec) {
    // Gate: proposal confirmed → planning (generate the plan).
    plan = await generatePlan(spec, proposal ?? fallbackProposal());
    status = "planning";
    reply = formatPlan(plan);
    kind = "plan";
    messages = [...nextHistory, msg("assistant", "plan", reply)];
  } else {
    // Discovery turn (or proposal iteration).
    const turn = await runDiscoveryTurn(history, latestUserText);
    reply = turn.reply;
    kind = turn.kind;
    options = turn.options;
    messages = [...nextHistory, msg("assistant", turn.kind, turn.reply)];
    if (turn.spec) {
      spec = turn.spec;
      proposal = await generateProposal(turn.spec);
      status = "proposal";
      messages.push(msg("assistant", "proposal", formatProposal(proposal)));
    } else {
      status = prevStatus === "proposal" ? "proposal" : "discovering";
    }
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
    messages,
  });
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
  const tasks = plan.tasks
    .map((t, i) => `${i + 1}. ${t.title} — ${t.description}`)
    .join("\n");
  return (
    (withFeedback
      ? "🔄 He ajustado el plan con tu feedback.\n\n"
      : "✅ Plan de desarrollo y pruebas listo:\n\n") +
    `${plan.summary}\n\n` +
    `**Fases**: ${plan.phases.join(" · ")}\n\n` +
    `**Tareas**:\n${tasks}\n\n` +
    `**Estrategia de pruebas**: ${plan.testStrategy}\n` +
    (plan.risks?.length ? `\n**Riesgos**: ${plan.risks.join("; ")}\n` : "") +
    `\n¿Apruebas el plan para empezar a construir, o quieres ajustar algo?`
  );
}
