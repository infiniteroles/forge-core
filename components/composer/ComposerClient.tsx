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
import { agentRoleMeta } from "@/lib/agents/roles";
import { Icon } from "@/components/Icon";
import { ComposerHeader } from "./ComposerHeader";

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
  if (i >= 0) return i;
  // Estados terminales fuera de la lista (p. ej. blocked) → último paso.
  return STEPS.length - 1;
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
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [wsStatus, setWsStatus] = useState<string | null>(null);
  const [wsSummary, setWsSummary] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ summary: string } | null>(null);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const notifiedWsRef = useRef<string | null>(null);

  type SessionMeta = {
    id: string;
    status: string;
    updatedAt: string;
    projectId: string | null;
    projectName: string | null;
    projectSlug: string | null;
  };

  const loadSession = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/composer/chat?id=${id}`);
      if (!res.ok) return false;
      const data = await res.json().catch(() => null);
      if (!data) return false;
      setSessionId(data.id as string);
      setStatus(data.status as ComposerStatus);
      if (Array.isArray(data.messages)) setMessages(data.messages as ComposerMessage[]);
      if (data.spec) setSpec(data.spec as ComposerSpec);
      else setSpec(null);
      if (data.proposal) setProposal(data.proposal as ComposerProposal);
      else setProposal(null);
      if (data.plan) setPlan(data.plan as ComposerPlan);
      else setPlan(null);
      if (data.projectId) setProjectId(data.projectId as string);
      else setProjectId(null);
      if (data.workSessionId) setWorkSessionId(data.workSessionId as string);
      else setWorkSessionId(null);
      setOptions([]);
      setPreview(null);
      setPreviewError(null);
      setDecision(null);
      notifiedWsRef.current = null;
      return true;
    } catch {
      return false;
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/composer/sessions");
      const data = (await res.json().catch(() => null)) as {
        sessions?: SessionMeta[];
      } | null;
      if (Array.isArray(data?.sessions)) setSessions(data.sessions);
    } catch {
      /* ignore */
    }
  }, []);

  // On mount: carga la lista de sesiones y retoma la última
  // (URL > localStorage > sesión más reciente) para no perder el histórico.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let list: SessionMeta[] = [];
      try {
        const res = await fetch("/api/composer/sessions");
        const data = (await res.json().catch(() => null)) as {
          sessions?: SessionMeta[];
        } | null;
        if (Array.isArray(data?.sessions)) list = data.sessions;
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      setSessions(list);
      const saved = localStorage.getItem("forge-composer-session");
      const candidate =
        initialSessionId ??
        (saved && list.some((s) => s.id === saved) ? saved : list[0]?.id ?? null);
      if (candidate) {
        const ok = await loadSession(candidate);
        if (ok && !cancelled) {
          history.replaceState(null, "", `/composer?session=${candidate}`);
          localStorage.setItem("forge-composer-session", candidate);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSession, initialSessionId]);

  const onSelectSession = useCallback(
    async (id: string) => {
      const ok = await loadSession(id);
      if (ok) {
        history.replaceState(null, "", `/composer?session=${id}`);
        localStorage.setItem("forge-composer-session", id);
      }
    },
    [loadSession]
  );

  const newConversation = useCallback(() => {
    setSessionId(null);
    setStatus("discovering");
    setMessages([]);
    setSpec(null);
    setProposal(null);
    setPlan(null);
    setProjectId(null);
    setWorkSessionId(null);
    setOptions([]);
    setPreview(null);
    setPreviewError(null);
    setDecision(null);
    setWsStatus(null);
    setWsSummary(null);
    notifiedWsRef.current = null;
    history.replaceState(null, "", "/composer");
    localStorage.removeItem("forge-composer-session");
  }, []);

  // Poll the linked project for a ready preview once the build is running.
  useEffect(() => {
    if (!projectId || !["building", "preview", "done"].includes(status)) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/composer/preview?projectId=${projectId}`);
        const data = (await res.json().catch(() => null)) as {
          preview?: { id: string; status: string; previewUrl: string | null; error: string | null } | null;
        } | null;
        const p = data?.preview;
        if (!p) return;
        if (p.previewUrl && p.status === "ready") {
          setPreview({ url: p.previewUrl, status: p.status });
          setPreviewError(null);
          clearInterval(id);
          return;
        }
        if (p.status === "failed" || p.status === "not_configured") {
          setPreviewError(
            p.error ||
              (p.status === "not_configured"
                ? "El preview no está configurado en este entorno."
                : "El preview no pudo desplegarse.")
          );
          clearInterval(id);
        }
        // queued/creating/deploying → keep polling
      } catch {
        // keep polling
      }
    }, 15000);
    return () => clearInterval(id);
  }, [projectId, status]);

  // Fase 6.8 — poll del estado de la WorkSession: si Forge necesita una decisión
  // real se pregunta AQUÍ en el chat (con opciones), y si termina/falla se avisa.
  useEffect(() => {
    if (!workSessionId || !["building", "preview", "done"].includes(status)) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/work-sessions/${workSessionId}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          status: string;
          summary?: string | null;
          error?: string | null;
        };
        setWsStatus(data.status);
        setWsSummary(data.summary ?? data.error ?? null);
        const key = `${data.status}|${data.summary ?? data.error ?? ""}`;
        if (notifiedWsRef.current === key) return;
        if (data.status === "waiting_for_user") {
          notifiedWsRef.current = key;
          const summary = (data.summary ?? data.error ?? "Forge necesita tu decisión.").trim();
          setDecision({ summary });
          setMessages((m) => [
            ...m,
            {
              id: `ws-decision-${Date.now()}`,
              role: "assistant",
              kind: "system",
              content:
                `🧭 **Forge necesita tu decisión**:\n\n${summary}\n\n` +
                `Puedes **continuar** (Forge aplica el siguiente paso seguro) o **pedir un cambio**.`,
              createdAt: new Date().toISOString(),
            },
          ]);
        } else if (
          ["completed", "completed_with_warnings", "failed"].includes(data.status)
        ) {
          notifiedWsRef.current = key;
          // Avanzar el stepper: el build ya no está en marcha.
          setStatus(
            data.status === "failed"
              ? "blocked"
              : data.status === "completed"
                ? "done"
                : "preview"
          );
          const summary = (data.summary ?? data.error ?? "El build ha terminado.").trim();
          const emoji =
            data.status === "failed"
              ? "❌"
              : data.status === "completed_with_warnings"
                ? "⚠️"
                : "✅";
          const verb =
            data.status === "failed"
              ? "El build ha fallado"
              : data.status === "completed_with_warnings"
                ? "El build terminó con avisos"
                : "El build ha terminado";
          setMessages((m) => [
            ...m,
            {
              id: `ws-end-${Date.now()}`,
              role: "assistant",
              kind: "text",
              content: `${emoji} ${verb}. ${summary}`,
              createdAt: new Date().toISOString(),
            },
          ]);
        }
      } catch {
        // keep polling
      }
    }, 10000);
    return () => clearInterval(id);
  }, [workSessionId, status]);

  const continueWorkSession = useCallback(async () => {
    if (!workSessionId) return;
    setDecision(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/work-sessions/${workSessionId}/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: "" }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        workSession?: { id?: string };
      } | null;
      if (res.ok && data?.workSession?.id) {
        setWorkSessionId(data.workSession.id);
        notifiedWsRef.current = null;
        setMessages((m) => [
          ...m,
          {
            id: `ws-continue-${Date.now()}`,
            role: "assistant",
            kind: "text",
            content: "▶️ Forge continúa trabajando. Te aviso cuando haya novedades.",
            createdAt: new Date().toISOString(),
          },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            id: `ws-continue-err-${Date.now()}`,
            role: "assistant",
            kind: "system",
            content:
              "⚠️ No pude continuar la sesión automáticamente. Revisa el proyecto y vuelve a intentarlo.",
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setLoading(false);
    }
  }, [workSessionId]);

  const askForChange = useCallback(() => {
    setDecision(null);
    setMessages((m) => [
      ...m,
      {
        id: `ws-change-${Date.now()}`,
        role: "assistant",
        kind: "text",
        content:
          "✏️ Cuéntame qué quieres cambiar y lo aplico como una nueva iteración.",
        createdAt: new Date().toISOString(),
      },
    ]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const applyResponse = useCallback(
    (res: ChatResponse) => {
      setSessionId(res.id);
      setStatus(res.status);
      if (res.messages) setMessages(res.messages);
      if (res.spec) setSpec(res.spec);
      if (res.proposal) setProposal(res.proposal);
      if (res.plan) setPlan(res.plan);
      if (res.projectId) setProjectId(res.projectId);
      if (res.workSessionId) setWorkSessionId(res.workSessionId);
      setOptions(res.options ?? []);
      // Persistir para que recargar la página no pierda el chat/proyecto.
      if (res.id) {
        history.replaceState(null, "", `/composer?session=${res.id}`);
        localStorage.setItem("forge-composer-session", res.id);
        void refreshSessions();
      }
    },
    [refreshSessions]
  );

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
      // La extracción de paleta es best-effort: si falla, seguimos y enviamos
      // el logo sin paleta para que el flujo nunca se quede colgado.
      let colors: string[] = [];
      try {
        colors = await extractPalette(file);
      } catch {
        colors = [];
      }
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
    ["building", "preview", "done", "blocked"].includes(status) || !!preview;
  const inputPlaceholder =
    loading
      ? "…"
      : ["building", "preview", "done"].includes(status)
        ? "Pide un cambio… (Enter para enviar)"
        : "Describe qué quieres que Forge construya… (Enter para enviar)";

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
        return "Alterna escritorio/móvil en el preview para comprobar el responsive.";
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
        <div className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-2xl border border-m3-outline-variant bg-m3-surface-container-low">
          <div className="flex items-center justify-between border-b border-m3-outline-variant bg-m3-surface-container px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-m3-on-surface-variant">
              <Icon name="visibility" className="text-[16px] leading-none" /> Preview DEV
            </span>
            <div className="flex items-center gap-2">
              {preview ? (
                <div className="flex overflow-hidden rounded-full border border-m3-outline-variant">
                  <button
                    onClick={() => setDevice("desktop")}
                    title="Vista escritorio"
                    aria-label="Vista escritorio"
                    className={`grid h-7 w-8 place-items-center transition ${device === "desktop" ? "bg-m3-primary text-m3-on-primary" : "bg-background text-m3-on-surface-variant hover:text-m3-on-surface"}`}
                  >
                    <Icon name="desktop_windows" className="text-[15px] leading-none" />
                  </button>
                  <button
                    onClick={() => setDevice("mobile")}
                    title="Vista móvil"
                    aria-label="Vista móvil"
                    className={`grid h-7 w-8 place-items-center transition ${device === "mobile" ? "bg-m3-primary text-m3-on-primary" : "bg-background text-m3-on-surface-variant hover:text-m3-on-surface"}`}
                  >
                    <Icon name="phone_iphone" className="text-[15px] leading-none" />
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
                <a href={preview.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-m3-primary hover:underline">
                  <Icon name="open_in_new" className="text-[14px] leading-none" /> Abrir en pestaña
                </a>
              ) : (
                <span className="flex items-center gap-1 text-xs text-m3-on-surface-variant">
                  <Icon name="hourglass_empty" className="text-[14px] leading-none" /> en espera…
                </span>
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
          ) : previewError ? (
            <div className="grid flex-1 place-items-center p-6 text-center text-sm text-m3-on-surface-variant">
              <div className="max-w-md">
                <p className="flex items-center justify-center gap-2 font-medium text-m3-error">
                  <Icon name="error" className="text-[20px] leading-none" /> El preview no está disponible.
                </p>
                <p className="mt-2 whitespace-pre-line text-xs leading-relaxed">
                  {previewError}
                </p>
              </div>
            </div>
          ) : wsStatus === "failed" ? (
            <div className="grid flex-1 place-items-center p-6 text-center text-sm text-m3-on-surface-variant">
              <div>
                <p className="flex items-center justify-center gap-2 font-medium text-m3-error">
                  <Icon name="error" className="text-[20px] leading-none" /> El build falló.
                </p>
                <p className="mt-1 text-xs">
                  {wsSummary ?? "Revisa el detalle en el proyecto."}
                </p>
              </div>
            </div>
          ) : wsStatus === "completed" || wsStatus === "completed_with_warnings" ? (
            <div className="grid flex-1 place-items-center p-6 text-center text-sm text-m3-on-surface-variant">
              <div>
                <p className="flex items-center justify-center gap-2 font-medium text-m3-on-surface">
                  <Icon name="check_circle" className="text-[20px] leading-none text-m3-primary" /> El build ha terminado, pero aún no hay una app que previsualizar.
                </p>
                <p className="mt-1 text-xs">
                  El repositorio todavía no contiene el código de la aplicación (solo el plan).
                  Con el scaffold mínimo (Next.js + shadcn) verás aquí el MVP de verdad.
                </p>
              </div>
            </div>
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
        <div className="rounded-2xl border border-m3-outline-variant bg-m3-surface-container-low p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-m3-on-surface">
              <Icon name="task_alt" className="text-[18px] leading-none text-m3-primary" /> Plan de desarrollo y pruebas
            </h3>
            <button onClick={approvePlan} disabled={loading}
              className="rounded-full bg-m3-primary px-4 py-1.5 text-sm font-medium text-m3-on-primary transition hover:opacity-90 disabled:opacity-50">
              {loading ? "Procesando…" : "Aprobar plan y construir"}
            </button>
          </div>
          <p className="mt-2 text-sm text-m3-on-surface-variant">{plan.summary}</p>
          <p className="mt-3 text-xs uppercase tracking-wide text-m3-on-surface-variant">Fases</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {plan.phases.map((ph) => (
              <span key={ph} className="rounded-full bg-m3-surface-container-high px-2 py-0.5 text-[11px] text-m3-on-surface-variant">{ph}</span>
            ))}
          </div>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-m3-on-surface-variant">
            {plan.tasks.map((t) => {
              const meta = agentRoleMeta(t.agent);
              return (
                <li key={t.title}>
                  <span className="mr-1 align-middle" title={meta.label}>
                    <Icon name={meta.iconName} className="text-[14px] leading-none text-m3-primary" filled />
                  </span>
                  <span className="text-m3-on-surface">{t.title}</span>
                  {t.description ? (
                    <span className="text-m3-on-surface-variant"> — {t.description}</span>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs text-m3-on-surface-variant">
            <span className="font-medium text-m3-on-surface">Pruebas:</span> {plan.testStrategy}
          </p>
          {plan.risks?.length ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-300">
              <Icon name="warning" className="text-[14px] leading-none" /> Riesgos: {plan.risks.join("; ")}
            </p>
          ) : null}
        </div>
      );
    }
    if (proposal && (status === "proposal" || status === "planning")) {
      return (
        <div className="rounded-2xl border border-m3-outline-variant bg-m3-surface-container-low p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-m3-on-surface">
              <Icon name="architecture" className="text-[18px] leading-none text-m3-primary" /> Propuesta inicial
            </h3>
            {status === "proposal" ? (
              <button onClick={confirmProposal} disabled={loading}
                className="rounded-full bg-m3-primary px-4 py-1.5 text-sm font-medium text-m3-on-primary transition hover:opacity-90 disabled:opacity-50">
                {loading ? "Procesando…" : "Confirmar propuesta"}
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-m3-on-surface-variant">{proposal.summary}</p>
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {(["Frontend", "Backend", "Base de datos", "Auth", "Hosting"] as const).map((k) => {
              const v = k === "Frontend" ? proposal.stack.frontend
                : k === "Backend" ? proposal.stack.backend
                : k === "Base de datos" ? proposal.stack.database
                : k === "Auth" ? proposal.stack.auth
                : proposal.stack.hosting;
              return (
                <div key={k} className="flex gap-2 rounded-lg bg-m3-surface-container px-2.5 py-1.5">
                  <dt className="text-m3-on-surface-variant">{k}:</dt>
                  <dd className="text-m3-on-surface">{v}</dd>
                </div>
              );
            })}
          </dl>
          {proposal.structure?.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-m3-on-surface-variant">
              {proposal.structure.map((s) => <li key={s}>{s}</li>)}
            </ul>
          ) : null}
          {proposal.openQuestions?.length ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-300">
              <Icon name="help" className="text-[14px] leading-none" /> Antes de construir: {proposal.openQuestions.join("; ")}
            </p>
          ) : null}
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-m3-outline p-8 text-center text-sm text-m3-on-surface-variant">
        <Icon name="architecture" className="mb-2 text-[32px] leading-none text-m3-outline" />
        <p className="font-medium text-m3-on-surface-variant">La propuesta de arquitectura aparecerá aquí</p>
        <p className="mt-1 text-xs">una vez que Forge tenga suficiente contexto sobre tu app.</p>
      </div>
    );
  })();

  const buildLinks =
    projectId || workSessionId ? (
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {projectId ? (
          <Link href={`/projects/${projectId}`}
            className="flex items-center gap-1 rounded-full bg-m3-primary px-3.5 py-1.5 text-xs font-medium text-m3-on-primary transition hover:opacity-90">
            Abrir proyecto creado <Icon name="arrow_forward" className="text-[14px] leading-none" />
          </Link>
        ) : null}
        {workSessionId ? (
          <Link href={`/work-sessions/${workSessionId}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 rounded-full border border-m3-outline-variant px-3.5 py-1.5 text-xs font-medium text-m3-primary transition hover:bg-m3-primary-container/40">
            <Icon name="play_circle" className="text-[14px] leading-none" /> Ver build autónomo en curso
          </Link>
        ) : null}
      </div>
    ) : null;

  // Selector de proyecto / conversación — debajo del chat.
  const sessionBar = (
    <div className="mt-2 flex items-center gap-1.5 rounded-full border border-m3-outline-variant bg-m3-surface-container px-2 py-1">
      <Icon
        name="folder_open"
        className="shrink-0 text-[16px] leading-none text-m3-on-surface-variant"
      />
      <select
        id="composer-session-select"
        value={sessionId ?? "__new__"}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__new__") newConversation();
          else void onSelectSession(v);
        }}
        title="Proyecto / conversación"
        className="w-full min-w-0 flex-1 bg-transparent text-xs text-m3-on-surface outline-none [&>option]:bg-surface"
      >
        <option value="__new__">Nueva conversación</option>
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.projectName ?? `Sesión ${s.status}`} ·{" "}
            {new Date(s.updatedAt).toLocaleString("es", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </option>
        ))}
      </select>
      {sessionId ? (
        <button
          type="button"
          onClick={newConversation}
          title="Nueva conversación"
          aria-label="Nueva conversación"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-m3-on-surface-variant transition hover:bg-m3-surface-container-high hover:text-m3-on-surface"
        >
          <Icon name="add" className="text-[16px] leading-none" />
        </button>
      ) : null}
    </div>
  );

  const chatColumn = (
    <div className="flex min-h-0 min-w-0 flex-col">
      {buildLinks}
      {/* Loading banner — always visible when Forge is working */}
      {loading ? (
        <div className="mb-2 flex items-center gap-2 rounded-full border border-m3-outline-variant bg-m3-surface-container-high px-3 py-2 text-xs text-m3-primary">
          <Icon name="sync" className="animate-spin text-[16px] leading-none" />
          Forge está trabajando…
        </div>
      ) : null}
      {/* Chat thread — ocupa toda la altura de la sidebar */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-2xl border border-m3-outline-variant bg-m3-surface-container-low p-4">
        {messages.length === 0 ? (
          <div className="mx-auto my-auto max-w-md text-center text-sm text-m3-on-surface-variant">
            <Icon name="waving_hand" className="mb-2 text-[40px] leading-none text-m3-primary" />
            <p className="font-medium text-m3-on-surface">Hola, soy Forge Composer.</p>
            <p className="mt-2">
              Cuéntame qué quieres construir (por ejemplo:{" "}
              <em>
                "una app para gestionar reservas de una peluquería, con login de
                clientes"
              </em>
              ). Si tienes logo, te lo preguntaré y podrás adjuntarlo con{" "}
              <Icon name="attach_file" className="align-middle text-[14px] leading-none" />.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                m.role === "user"
                  ? "self-end rounded-br-md bg-m3-primary-container text-m3-on-primary-container"
                  : m.kind === "proposal"
                    ? "self-start rounded-bl-md bg-m3-surface-container-high text-m3-on-surface"
                    : m.kind === "system"
                      ? "self-start rounded-bl-md border border-m3-outline-variant bg-m3-error/10 text-m3-error"
                      : "self-start rounded-bl-md border border-m3-outline-variant bg-m3-surface-container text-m3-on-surface"
              }`}
            >
              {m.kind === "logo" ? (
                <span className="flex items-center gap-1.5 text-m3-on-surface-variant">
                  <Icon name="image" className="text-[16px] leading-none" />
                  Logo subido — paleta dominante:{" "}
                  <span className="font-mono text-m3-on-surface">
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
              className="rounded-full border border-m3-outline-variant bg-m3-surface-container px-3.5 py-1.5 text-sm text-m3-on-surface transition hover:bg-m3-surface-container-high disabled:opacity-50"
            >
              {opt}
            </button>
          ))}
        </div>
      ) : null}

      {/* Forge needs a decision → ask in the chat */}
      {decision && !loading ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => void continueWorkSession()}
            className="flex items-center gap-1.5 rounded-full bg-m3-primary px-3.5 py-1.5 text-sm font-medium text-m3-on-primary transition hover:opacity-90 disabled:opacity-50"
          >
            <Icon name="play_arrow" className="text-[18px] leading-none" /> Continuar
          </button>
          <button
            onClick={askForChange}
            className="flex items-center gap-1.5 rounded-full border border-m3-outline-variant bg-m3-surface-container px-3.5 py-1.5 text-sm text-m3-on-surface transition hover:bg-m3-surface-container-high disabled:opacity-50"
          >
            <Icon name="edit" className="text-[16px] leading-none" /> Pedir un cambio
          </button>
        </div>
      ) : null}

      {/* Input — alto y a todo el ancho de la sidebar */}
      <div className="mt-2 flex items-end gap-2 rounded-[24px] border border-m3-outline-variant bg-m3-surface-container p-2">
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
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition disabled:opacity-50 ${logoName ? "bg-m3-primary-container text-m3-on-primary-container" : "text-m3-on-surface-variant hover:bg-m3-surface-container-high hover:text-m3-on-surface"}`}
        >
          <Icon name={logoName ? "image" : "attach_file"} className="text-[20px] leading-none" />
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
          className="min-h-[2.5rem] w-full flex-1 resize-none rounded-[18px] bg-m3-surface-container-high px-3 py-2 text-sm text-m3-on-surface outline-none transition placeholder:text-m3-on-surface-variant focus:bg-m3-surface-container-highest disabled:opacity-50"
        />
        <button
          onClick={() => void sendMessage()}
          disabled={loading || !input.trim() || isBlocked}
          aria-label="Enviar mensaje"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-m3-primary text-m3-on-primary transition hover:opacity-90 disabled:opacity-50"
        >
          <Icon name="send" className="text-[20px] leading-none" />
        </button>
      </div>
      {logoName ? (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-m3-on-surface-variant">
          <Icon name="image" className="text-[14px] leading-none" /> {logoName} — paleta inferida y enviada a Forge.
        </p>
      ) : null}

      {/* Desplegable de proyecto / nueva conversación, debajo del chat */}
      {sessionBar}
    </div>
  );

  const tip = tipFor(status, loading);

  // Pasos del Composer — debajo del área de previsualización.
  const stepsBar = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-m3-outline-variant bg-m3-surface-container-low px-3 py-1.5">
      <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-m3-on-surface-variant">
        <Icon name="view_agenda" className="text-[14px] leading-none" /> Pasos
      </span>
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1.5">
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              i < step
                ? "bg-m3-primary-container text-m3-on-primary-container"
                : i === step
                  ? "bg-m3-primary text-m3-on-primary"
                  : "bg-m3-surface-container-high text-m3-on-surface-variant"
            }`}
          >
            {i < step ? (
              <Icon name="check" className="text-[12px] leading-none" />
            ) : null}
            {s.label}
          </span>
          {i < STEPS.length - 1 ? (
            <Icon name="chevron_right" className="text-[14px] leading-none text-m3-outline" />
          ) : null}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Cabecera plegable + tip contextual al lado de Forge Composer */}
      <ComposerHeader tip={tip} />

      {/* Workspace: chat en sidebar ancha + contenido ocupa el resto */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <aside className="flex min-h-0 w-full flex-col lg:w-[400px] lg:min-w-[360px] lg:max-w-[440px] lg:shrink-0">
          {chatColumn}
        </aside>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">{rightPanel}</div>
          {/* Pasos debajo del área de previsualización */}
          {stepsBar}
        </div>
      </div>

      {spec ? (
        <div className="flex items-center gap-1 text-xs text-m3-on-surface-variant">
          <Icon name="description" className="text-[14px] leading-none" />
          <span className="font-medium text-m3-on-surface">Spec:</span>{" "}
          {spec.name} · {spec.purpose.slice(0, 90)}
          {spec.purpose.length > 90 ? "…" : ""} · auth: {spec.auth} · UI:{" "}
          {spec.uiLibrary}
          {spec.palette?.length ? ` · paleta: ${spec.palette.join(" ")}` : ""}
        </div>
      ) : null}
    </div>
  );
}
