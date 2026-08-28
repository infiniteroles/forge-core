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
  workSessionId?: string | null;
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

export function ComposerClient({ initialSessionId }: { initialSessionId?: string }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ComposerMessage[]>([]);
  const [status, setStatus] = useState<ComposerStatus>("discovering");
  const [spec, setSpec] = useState<ComposerSpec | null>(null);
  const [proposal, setProposal] = useState<ComposerProposal | null>(null);
  const [plan, setPlan] = useState<ComposerPlan | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [workSessionId, setWorkSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ url: string; status: string } | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  // Load an existing session when navigating back from a work session link.
  useEffect(() => {
    if (!initialSessionId) return;
    void (async () => {
      try {
        const res = await fetch(`/api/composer/chat?id=${initialSessionId}`);
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!data) return;
        setSessionId(data.id as string);
        setStatus(data.status as ComposerStatus);
        if (Array.isArray(data.messages)) setMessages(data.messages as ComposerMessage[]);
        if (data.spec) setSpec(data.spec as ComposerSpec);
        if (data.proposal) setProposal(data.proposal as ComposerProposal);
        if (data.plan) setPlan(data.plan as ComposerPlan);
        if (data.projectId) setProjectId(data.projectId as string);
      } catch { /* ignore */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId]);

  // Poll the linked project for a ready preview once the build is running.
  useEffect(() => {
    if (!projectId || !["building", "preview", "done"].includes(status)) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/composer/preview?projectId=${projectId}`);
        const data = (await res.json().catch(() => null)) as {
          preview?: { id: string; status: string; previewUrl: string | null } | null;
        } | null;
        const p = data?.preview;
        if (p?.previewUrl && p.status === "ready") {
          setPreview({ url: p.previewUrl, status: p.status });
          clearInterval(id);
        }
      } catch {
        // keep polling
      }
    }, 15000);
    return () => clearInterval(id);
  }, [projectId, status]);

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
    if (res.workSessionId) setWorkSessionId(res.workSessionId);
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

  const isBlocked = false; // the chat stays usable: in building/preview it triggers iterations
  const step = stepIndex(status);
  const inWorkspace =
    ["building", "preview", "done"].includes(status) || !!preview;
  const inputPlaceholder =
    loading
      ? "…"
      : ["building", "preview", "done"].includes(status)
        ? "Pide un cambio… (Enter para enviar)"
        : "Describe tu aplicación… (Enter para enviar)";

  function tipFor(s: ComposerStatus, loadingNow: boolean): string {
    if (loadingNow) return "Forge está trabajando en ello…";
    switch (s) {
      case "discovering":
        return "Haré una pregunta cada vez; las que tienen opciones puedes pulsarlas.";
      case "proposal":
        return "Revisa la propuesta de arquitectura y confírmala o pide cambios.";
      case "planning":
        return "Revisa el plan de desarrollo y pruebas antes de aprobarlo.";
      case "building":
        return "El build está en marcha; puedes pedir cambios por chat aunque no haya terminado.";
      case "preview":
        return "Alterna 🖥️/📱 en el preview para comprobar el responsive.";
      case "done":
        return "El MVP está listo: abre el proyecto y sigue iterando, o clónalo a tu IDE.";
      default:
        return "Enter para enviar · Shift+Enter para salto de línea.";
    }
  }

  // ── Right panel — shows proposal, plan, or preview depending on phase ──────
  const rightPanel = (() => {
    if (inWorkspace) {
      return (
        <div className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-wide text-text-dim">Preview DEV</span>
            <div className="flex items-center gap-2">
              {preview ? (
                <div className="flex overflow-hidden rounded-md border border-border">
                  <button
                    onClick={() => setDevice("desktop")}
                    title="Vista escritorio"
                    className={`px-2 py-1 text-[11px] transition ${device === "desktop" ? "bg-accent text-black" : "bg-background text-text-dim hover:text-neutral-100"}`}
                  >
                    🖥️
                  </button>
                  <button
                    onClick={() => setDevice("mobile")}
                    title="Vista móvil"
                    className={`px-2 py-1 text-[11px] transition ${device === "mobile" ? "bg-accent text-black" : "bg-background text-text-dim hover:text-neutral-100"}`}
                  >
                    📱
                  </button>
                </div>
              ) : null}
              {loading ? (
                <span className="flex items-center gap-1.5 text-xs text-accent">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                  Forge trabajando…
                </span>
              ) : null}
              {preview ? (
                <a href={preview.url} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
                  Abrir en pestaña ↗
                </a>
              ) : (
                <span className="text-xs text-text-dim">en espera…</span>
              )}
            </div>
          </div>
          {preview ? (
            device === "mobile" ? (
              <div className="grid flex-1 place-items-center overflow-hidden bg-neutral-900 p-4">
                <div className="flex h-full max-h-full w-[390px] max-w-full flex-col overflow-hidden rounded-[2rem] border-4 border-neutral-700 bg-black shadow-2xl">
                  <div className="flex h-6 shrink-0 items-center justify-center gap-1.5 bg-neutral-800">
                    <span className="h-1.5 w-12 rounded-full bg-neutral-600" />
                  </div>
                  <iframe src={preview.url} title="DEV Preview móvil" className="w-full flex-1 border-0 bg-white" />
                </div>
              </div>
            ) : (
              <iframe src={preview.url} title="DEV Preview" className="h-full w-full flex-1 border-0 bg-white" />
            )
          ) : (
            <div className="grid flex-1 place-items-center p-6 text-center text-sm text-text-dim">
              <div>
                <div className="mb-3 flex justify-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="inline-block h-2 w-2 animate-bounce rounded-full bg-accent/60"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                Forge está construyendo el MVP…<br />
                el preview aparecerá aquí cuando esté listo.
              </div>
            </div>
          )}
        </div>
      );
    }
    if (plan && status === "planning") {
      return (
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-100">Plan de desarrollo y pruebas</h3>
            <button onClick={approvePlan} disabled={loading}
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-50">
              {loading ? "Procesando…" : "Aprobar plan y construir"}
            </button>
          </div>
          <p className="mt-2 text-sm text-neutral-300">{plan.summary}</p>
          <p className="mt-3 text-xs uppercase tracking-wide text-text-dim">Fases</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {plan.phases.map((ph) => (
              <span key={ph} className="rounded-full bg-neutral-800/70 px-2 py-0.5 text-[11px] text-neutral-300">{ph}</span>
            ))}
          </div>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-neutral-300">
            {plan.tasks.map((t) => (
              <li key={t.title}>
                <span className="text-neutral-100">{t.title}</span>
                {t.description ? <span className="text-text-dim"> — {t.description}</span> : null}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-text-dim">
            <span className="font-medium text-neutral-300">Pruebas:</span> {plan.testStrategy}
          </p>
          {plan.risks?.length ? <p className="mt-2 text-xs text-amber-300">Riesgos: {plan.risks.join("; ")}</p> : null}
        </div>
      );
    }
    if (proposal && (status === "proposal" || status === "planning")) {
      return (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-100">Propuesta inicial</h3>
            {status === "proposal" ? (
              <button onClick={confirmProposal} disabled={loading}
                className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-50">
                {loading ? "Procesando…" : "Confirmar propuesta"}
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-neutral-300">{proposal.summary}</p>
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {(["Frontend", "Backend", "Base de datos", "Auth", "Hosting"] as const).map((k) => {
              const v = k === "Frontend" ? proposal.stack.frontend
                : k === "Backend" ? proposal.stack.backend
                : k === "Base de datos" ? proposal.stack.database
                : k === "Auth" ? proposal.stack.auth
                : proposal.stack.hosting;
              return (
                <div key={k} className="flex gap-2">
                  <dt className="text-text-dim">{k}:</dt>
                  <dd className="text-neutral-200">{v}</dd>
                </div>
              );
            })}
          </dl>
          {proposal.structure?.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-300">
              {proposal.structure.map((s) => <li key={s}>{s}</li>)}
            </ul>
          ) : null}
          {proposal.openQuestions?.length ? (
            <p className="mt-3 text-xs text-amber-300">Antes de construir: {proposal.openQuestions.join("; ")}</p>
          ) : null}
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-dim">
        <p className="text-neutral-400">La propuesta de arquitectura aparecerá aquí</p>
        <p className="mt-1 text-xs">una vez que Forge tenga suficiente contexto sobre tu app.</p>
      </div>
    );
  })();

  const buildLinks =
    projectId || workSessionId ? (
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {projectId ? (
          <Link href={`/projects/${projectId}`}
            className="rounded-md bg-accent px-3.5 py-1.5 text-xs font-medium text-black transition hover:opacity-90">
            Abrir proyecto creado →
          </Link>
        ) : null}
        {workSessionId ? (
          <Link href={`/work-sessions/${workSessionId}`} target="_blank" rel="noreferrer"
            className="rounded-md border border-emerald-500/40 px-3.5 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/10">
            Ver build autónomo en curso ↗
          </Link>
        ) : null}
      </div>
    ) : null;

  const chatColumn = (
    <div className="flex min-h-0 min-w-0 flex-col">
      {buildLinks}
      {/* Loading banner — always visible when Forge is working */}
      {loading ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-accent">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          Forge está trabajando…
        </div>
      ) : null}
      {/* Chat thread — ocupa toda la altura de la sidebar */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-surface p-4">
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
              ). Si tienes logo, te lo preguntaré y podrás adjuntarlo con 📎.
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
          <div className="flex items-center gap-1.5 self-start">
            {[0, 1, 2].map((i) => (
              <span key={i} className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-text-dim"
                style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {/* Clickable options for closed questions */}
      {options.length > 0 && !loading ? (
        <div className="mt-2 flex flex-wrap gap-2">
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

      {/* Input — alto y a todo el ancho de la sidebar */}
      <div className="mt-2 flex items-end gap-2 rounded-xl border border-border bg-surface p-2">
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
          title="Adjuntar logo"
          aria-label="Adjuntar logo"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-border bg-background text-base text-text-dim transition hover:text-neutral-100 disabled:opacity-50"
        >
          {logoName ? "🖼️" : "📎"}
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
          rows={2}
          disabled={loading || isBlocked}
          placeholder={inputPlaceholder}
          className="min-h-[2.5rem] w-full flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-neutral-200 outline-none transition placeholder:text-text-dim focus:border-accent/60 disabled:opacity-50"
        />
        <button
          onClick={() => void sendMessage()}
          disabled={loading || !input.trim() || isBlocked}
          className="h-11 shrink-0 rounded-md bg-accent px-4 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-50"
        >
          Enviar
        </button>
      </div>
      {logoName ? (
        <p className="mt-1 text-[11px] text-text-dim">🖼️ {logoName} — paleta inferida y enviada a Forge.</p>
      ) : null}
    </div>
  );

  const tip = tipFor(status, loading);

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Workspace: chat en sidebar ancha + contenido ocupa el resto */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <aside className="flex min-h-0 w-full flex-col lg:w-[400px] lg:min-w-[360px] lg:max-w-[440px] lg:shrink-0">
          {chatColumn}
        </aside>
        <div className="min-h-0 flex-1 overflow-hidden">{rightPanel}</div>
      </div>

      {/* Footer fijado al pie: pasos del Composer + tip */}
      <footer className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border bg-surface px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-text-dim">Pasos</span>
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                i < step
                  ? "bg-emerald-500/10 text-emerald-600"
                  : i === step
                    ? "bg-accent text-black"
                    : "bg-neutral-800/60 text-neutral-500"
              }`}
            >
              {i < step ? "✓ " : ""}
              {s.label}
            </span>
            {i < STEPS.length - 1 ? (
              <span className="text-text-dim">→</span>
            ) : null}
          </div>
        ))}
        <span className="ml-auto flex max-w-md items-center gap-1.5 text-[11px] text-text-dim">
          <span aria-hidden>💡</span>
          <span className="truncate">{tip}</span>
        </span>
      </footer>

      {spec ? (
        <div className="text-xs text-text-dim">
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
