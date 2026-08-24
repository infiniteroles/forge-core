"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ComposerMessage,
  ComposerPlan,
  ComposerProposal,
  ComposerSpec,
  ComposerStatus,
} from "@/lib/composer/types";

type ChatResponse = {
  id: string;
  status: ComposerStatus;
  reply: string;
  kind: string;
  options?: string[];
  spec?: ComposerSpec | null;
  proposal?: ComposerProposal | null;
  plan?: ComposerPlan | null;
  projectId?: string | null;
  messages?: ComposerMessage[];
};

const STEPS: { key: ComposerStatus; label: string }[] = [
  { key: "discovering", label: "Descubrimiento" },
  { key: "proposal", label: "Propuesta" },
  { key: "planning", label: "Plan" },
  { key: "building", label: "Build" },
  { key: "preview", label: "Preview" },
  { key: "done", label: "Listo" },
];

function stepIndex(status: ComposerStatus): number {
  const i = STEPS.findIndex((s) => s.key === status);
  return i < 0 ? 0 : i;
}

async function extractPalette(file: File): Promise<string[]> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("No se pudo cargar la imagen"));
      img.src = url;
    });
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    const buckets = new Map<string, number>();
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 128) continue;
      const key = `${data[i] >> 5}-${data[i + 1] >> 5}-${data[i + 2] >> 5}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const top = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return top.map(([k]) => {
      const [r, g, b] = k.split("-").map(Number);
      const hex =
        (((r << 5) << 16) | ((g << 5) << 8) | (b << 5))
          .toString(16)
          .padStart(6, "0");
      return `#${hex}`;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ComposerClient() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ComposerMessage[]>([]);
  const [status, setStatus] = useState<ComposerStatus>("discovering");
  const [spec, setSpec] = useState<ComposerSpec | null>(null);
  const [proposal, setProposal] = useState<ComposerProposal | null>(null);
  const [plan, setPlan] = useState<ComposerPlan | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const applyResponse = useCallback((res: ChatResponse) => {
    setSessionId(res.id);
    setStatus(res.status);
    if (res.messages) setMessages(res.messages);
    if (res.spec) setSpec(res.spec);
    if (res.proposal) setProposal(res.proposal);
    if (res.plan) setPlan(res.plan);
    if (res.projectId) setProjectId(res.projectId);
    setOptions(res.options ?? []);
  }, []);

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setLoading(true);
      try {
        const res = await fetch("/api/composer/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json().catch(() => null)) as ChatResponse | null;
        if (!res.ok || !data) {
          const err = (data as { error?: string } | null)?.error ?? "Error al conectar";
          setMessages((m) => [
            ...m,
            {
              id: `err-${Date.now()}`,
              role: "assistant",
              kind: "system",
              content: `⚠️ ${err}`,
              createdAt: new Date().toISOString(),
            },
          ]);
          return;
        }
        applyResponse(data);
      } finally {
        busyRef.current = false;
        setLoading(false);
      }
    },
    [applyResponse]
  );

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    await post({ sessionId, message: text });
  }, [input, loading, sessionId, post]);

  const onUploadLogo = useCallback(
    async (file: File) => {
      setLogoName(file.name);
      setInput("");
      const colors = await extractPalette(file);
      await post({
        sessionId,
        message: "",
        logo: { hasLogo: true, dominantColors: colors },
      });
    },
    [sessionId, post]
  );

  const pickOption = useCallback(
    async (option: string) => {
      setOptions([]);
      await post({ sessionId, message: option });
    },
    [sessionId, post]
  );

  const confirmProposal = useCallback(async () => {
    await post({
      sessionId,
      message:
        "Confirmo la propuesta. Genera el plan de desarrollo y pruebas para empezar a construir.",
    });
  }, [sessionId, post]);

  const approvePlan = useCallback(async () => {
    await post({
      sessionId,
      message: "Apruebo el plan. Empezad a construir el MVP.",
    });
  }, [sessionId, post]);

  const isBlocked =
    status !== "discovering" && status !== "proposal" && status !== "planning";
  const step = stepIndex(status);

  return (
    <div className="mt-6">
      {/* Progress stepper */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                i < step
                  ? "bg-emerald-500/10 text-emerald-300"
                  : i === step
                    ? "bg-accent text-black"
                    : "bg-neutral-800/60 text-neutral-500"
              }`}
            >
              {i < step ? "✓ " : ""}
              {s.label}
            </span>
            {i < STEPS.length - 1 ? (
              <span className="text-neutral-600">→</span>
            ) : null}
          </div>
        ))}
      </div>

      {/* Chat thread */}
      <div className="flex max-h-[52vh] min-h-[260px] flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-surface p-4">
        {messages.length === 0 ? (
          <div className="mx-auto my-auto max-w-md text-center text-sm text-text-dim">
            <p className="text-neutral-200">
              👋 Hola, soy Forge Composer.
            </p>
            <p className="mt-2">
              Cuéntame qué quieres construir (por ejemplo:{" "}
              <em>
                "una app para gestionar reservas de una peluquería, con login de
                clientes"
              </em>
              ). También puedes subir tu logo para que infiera el estilo.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-xl border px-3 py-2 text-sm ${
                m.role === "user"
                  ? "self-end border-accent/40 bg-accent/10 text-neutral-100"
                  : m.kind === "proposal"
                    ? "self-start border-emerald-500/30 bg-emerald-500/5 text-neutral-100"
                    : m.kind === "system"
                      ? "self-start border-red-500/30 bg-red-500/5 text-red-200"
                      : "self-start border-border bg-background text-neutral-200"
              }`}
            >
              {m.kind === "logo" ? (
                <span className="text-neutral-300">
                  🎨 Logo subido — paleta dominante:{" "}
                  <span className="font-mono text-neutral-100">
                    {m.content || "sí"}
                  </span>
                </span>
              ) : (
                <span className="whitespace-pre-wrap">{m.content}</span>
              )}
            </div>
          ))
        )}
        {loading ? (
          <div className="self-start text-sm text-text-dim">Forge está pensando…</div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {/* Clickable options for closed questions */}
      {options.length > 0 && !loading ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => void pickOption(opt)}
              disabled={loading}
              className="rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1.5 text-sm text-neutral-100 transition hover:bg-accent/20 disabled:opacity-50"
            >
              {opt}
            </button>
          ))}
        </div>
      ) : null}

      {/* Proposal card */}
      {proposal && !plan && status === "proposal" ? (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-100">
              Propuesta inicial
            </h3>
            <button
              onClick={confirmProposal}
              disabled={loading}
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-50"
            >
              Confirmar propuesta
            </button>
          </div>
          <p className="mt-2 text-sm text-neutral-300">{proposal.summary}</p>
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {(
              [
                ["Frontend", proposal.stack.frontend],
                ["Backend", proposal.stack.backend],
                ["Base de datos", proposal.stack.database],
                ["Auth", proposal.stack.auth],
                ["Hosting", proposal.stack.hosting],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="text-text-dim">{k}:</dt>
                <dd className="text-neutral-200">{v}</dd>
              </div>
            ))}
          </dl>
          {proposal.structure?.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-300">
              {proposal.structure.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : null}
          {proposal.openQuestions?.length ? (
            <p className="mt-3 text-xs text-amber-300">
              Antes de construir: {proposal.openQuestions.join("; ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Plan card */}
      {plan && status === "planning" ? (
        <div className="mt-4 rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-100">
              Plan de desarrollo y pruebas
            </h3>
            <button
              onClick={approvePlan}
              disabled={loading}
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-50"
            >
              Aprobar plan y construir
            </button>
          </div>
          <p className="mt-2 text-sm text-neutral-300">{plan.summary}</p>
          <p className="mt-3 text-xs uppercase tracking-wide text-text-dim">
            Fases
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {plan.phases.map((ph) => (
              <span
                key={ph}
                className="rounded-full bg-neutral-800/70 px-2 py-0.5 text-[11px] text-neutral-300"
              >
                {ph}
              </span>
            ))}
          </div>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-neutral-300">
            {plan.tasks.map((t) => (
              <li key={t.title}>
                <span className="text-neutral-100">{t.title}</span>
                {t.description ? (
                  <span className="text-text-dim"> — {t.description}</span>
                ) : null}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-text-dim">
            <span className="font-medium text-neutral-300">Pruebas:</span>{" "}
            {plan.testStrategy}
          </p>
          {plan.risks?.length ? (
            <p className="mt-2 text-xs text-amber-300">
              Riesgos: {plan.risks.join("; ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {status === "building" ? (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-200">
          ✅ Plan aprobado. El desarrollo autónomo continuará desde el proyecto:
          configuración de repositorio e infraestructura, y primer MVP
          previsualizable.
          {projectId ? (
            <div className="mt-3">
              <Link
                href={`/projects/${projectId}`}
                className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-black transition hover:opacity-90"
              >
                Abrir proyecto creado →
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Input */}
      <div className="mt-4 flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onUploadLogo(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading || isBlocked}
          title="Subir logo (no se genera ningún logo)"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-text-dim transition hover:text-neutral-100 disabled:opacity-50"
        >
          {logoName ? "🖼️ " + logoName : "🎨 Subir logo"}
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage();
            }
          }}
          rows={1}
          disabled={loading || isBlocked}
          placeholder={
            isBlocked
              ? "Sesión en fase " + status
              : "Describe tu aplicación… (Enter para enviar)"
          }
          className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-neutral-200 outline-none transition placeholder:text-text-dim focus:border-accent/60 disabled:opacity-50"
        />
        <button
          onClick={() => void sendMessage()}
          disabled={loading || !input.trim() || isBlocked}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-50"
        >
          Enviar
        </button>
      </div>

      {spec ? (
        <div className="mt-3 text-xs text-text-dim">
          <span className="font-medium text-neutral-300">Spec:</span>{" "}
          {spec.name} · {spec.purpose.slice(0, 90)}
          {spec.purpose.length > 90 ? "…" : ""} · auth: {spec.auth} · UI:{" "}
          {spec.uiLibrary}
          {spec.palette?.length ? ` · paleta: ${spec.palette.join(" ")}` : ""}
        </div>
      ) : null}
    </div>
  );
}
