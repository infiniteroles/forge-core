import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { runDiscoveryTurn } from "@/lib/composer/discovery";
import { generateProposal } from "@/lib/composer/proposal";
import type {
  ComposerMessage,
  ComposerMessageKind,
  ComposerSpec,
  ComposerProposal,
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
  const startedFromProposal = session?.status === "proposal";
  if (session && !["discovering", "proposal"].includes(session.status)) {
    return NextResponse.json(
      {
        error:
          "La sesión ya está en fase " +
          session.status +
          ". Crea una nueva o continúa desde el flujo de propuesta.",
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

  const turn = await runDiscoveryTurn(history, latestUserText);
  const assistantMsg = msg("assistant", turn.kind, turn.reply);
  const messages = [...nextHistory, assistantMsg];

  let spec: ComposerSpec | null = turn.spec ?? null;
  let proposal: ComposerProposal | null = null;
  let status: ComposerStatus = startedFromProposal ? "proposal" : turn.status;

  if (turn.spec) {
    proposal = await generateProposal(turn.spec);
    status = "proposal";
    // Add a proposal assistant message for visibility in the thread.
    messages.push(
      msg(
        "assistant",
        "proposal",
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
      )
    );
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
      logoUrl: logo ? session.logoUrl ?? "uploaded" : session.logoUrl,
      palette: toJson(logo?.dominantColors ?? null) ?? toJson(session.palette),
    },
  });

  return NextResponse.json({
    id: session.id,
    status,
    reply: turn.reply,
    kind: turn.kind,
    spec,
    proposal,
    messages,
  });
}
