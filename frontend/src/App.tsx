import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Box,
  ExternalLink,
  Layers,
  MessageSquarePlus,
  PanelRightClose,
  PanelRightOpen,
  Power,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { AgentReactor3D } from "./components/AgentReactor3D";
import { HITLBanner } from "./components/HITLBanner";
import { InspectorPanel } from "./components/InspectorPanel";
import { Modulo1Workspace } from "./components/Modulo1Workspace";
import { ReActTimeline } from "./components/ReActTimeline";
import {
  deleteThread,
  fetchEvaluationMetrics,
  fetchHealth,
  fetchLongTermStore,
  fetchThreadDetail,
  fetchThreads,
  forkThread,
  resumeHITLDecision,
  shutdownSystem,
  streamChatMessage,
  toggleInjectionTrap,
} from "./services/api";
import type {
  ChatTurn,
  CheckpointInfo,
  CitationItem,
  EvalMetricsResponse,
  HITLInterruptPayload,
  HealthStatus,
  LongTermStoreProfile,
  ReActStep,
  RouterDecision,
  ThreadSummary,
} from "./types/agent";

const THREAD_STORAGE_KEY = "tq_active_thread_id";
const USER_STORAGE_KEY = "tq_active_user_id";

function generateThreadId(): string {
  return `hilo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function FormattedAnswer({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="max-w-[78ch] space-y-1.5 text-sm leading-relaxed text-[#dbe6f5]">
      {lines.map((line, idx) => {
        if (line.startsWith("### ")) {
          return (
            <h4 key={idx} className="pt-1.5 text-sm font-bold tracking-tight text-[#00f5ff]">
              {line.slice(4)}
            </h4>
          );
        }
        if (line.startsWith("> ")) {
          return (
            <div
              key={idx}
              className="rounded-xl border border-[#ff4d00]/55 bg-[#ff4d00]/12 px-3 py-2 text-xs text-[#ffb08e]"
            >
              {line.slice(2).replace(/\*\*/g, "")}
            </div>
          );
        }
        if (!line.trim()) {
          return <div key={idx} className="h-1" />;
        }
        const formatted = line.replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1");
        return (
          <p
            key={idx}
            className={line.startsWith("- ") ? "pl-3 text-[13px] text-[#eef4fc]" : "text-[14px]"}
          >
            {formatted}
          </p>
        );
      })}
    </div>
  );
}

export function App() {
  const [userId, setUserId] = useState<string>(
    () => localStorage.getItem(USER_STORAGE_KEY) || "ana_tq",
  );
  const [threadId, setThreadId] = useState<string>(() => {
    const saved = localStorage.getItem(THREAD_STORAGE_KEY);
    if (saved) return saved;
    const fresh = generateThreadId();
    localStorage.setItem(THREAD_STORAGE_KEY, fresh);
    return fresh;
  });

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [checkpoints, setCheckpoints] = useState<CheckpointInfo[]>([]);
  const [storeProfile, setStoreProfile] = useState<LongTermStoreProfile | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [evalMetrics, setEvalMetrics] = useState<EvalMetricsResponse | null>(null);
  const [pendingInterrupt, setPendingInterrupt] = useState<HITLInterruptPayload | null>(null);

  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [showInspector, setShowInspector] = useState(true);
  const [showReactor, setShowReactor] = useState(true);
  const [reactorExpanded, setReactorExpanded] = useState(false);
  const [activeModule, setActiveModule] = useState<"m2" | "m1">("m2");
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [isPoweredOff, setIsPoweredOff] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const syncSidebarData = useCallback(
    async (activeThread: string, activeUser: string) => {
      try {
        const [h, thList, detail, st] = await Promise.all([
          fetchHealth(),
          fetchThreads(),
          fetchThreadDetail(activeThread),
          fetchLongTermStore(activeUser),
        ]);
        setHealth(h);
        setThreads(thList);
        setCheckpoints(detail.checkpoints ?? []);
        setStoreProfile(st);
        setPendingInterrupt((detail.pending_interrupt as HITLInterruptPayload | null) ?? null);

        const hydratedTurns: ChatTurn[] = (detail.traces ?? []).map((t) => ({
          id: `trace-${t.trace_id}`,
          userQuery: t.user_query,
          assistantAnswer: t.assistant_response,
          routerDecision: t.router_decision as unknown as RouterDecision,
          steps: (t.steps ?? []) as unknown as ReActStep[],
          citations: (t.citations ?? []) as unknown as CitationItem[],
          shieldTriggered: (t.citations ?? []).some((c) => Boolean(c.is_injection_trap)),
          blockedAlerts: [],
          checkpointId: t.checkpoint_id,
          isStreaming: false,
        }));
        setTurns(hydratedTurns);
      } catch (err) {
        setErrorBanner(
          err instanceof Error
            ? err.message
            : "Backend FastAPI inaccesible. Verifica el servicio activo.",
        );
      }
    },
    [],
  );

  useEffect(() => {
    localStorage.setItem(THREAD_STORAGE_KEY, threadId);
  }, [threadId]);

  useEffect(() => {
    localStorage.setItem(USER_STORAGE_KEY, userId);
  }, [userId]);

  useEffect(() => {
    void syncSidebarData(threadId, userId);
    void fetchEvaluationMetrics()
      .then(setEvalMetrics)
      .catch(() => undefined);
  }, [threadId, userId, syncSidebarData]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, pendingInterrupt]);

  const sendQuery = async (textToSend: string, targetThreadId?: string) => {
    const clean = textToSend.trim();
    if (!clean || isStreaming) return;

    const activeThread = targetThreadId ?? threadId;
    if (targetThreadId) setThreadId(targetThreadId);

    setErrorBanner(null);
    setPendingInterrupt(null);
    setInput("");
    setIsStreaming(true);

    const turnId = `turn-${Date.now()}`;
    setTurns((prev) => [
      ...prev,
      {
        id: turnId,
        userQuery: clean,
        assistantAnswer: "",
        steps: [],
        citations: [],
        shieldTriggered: false,
        blockedAlerts: [],
        isStreaming: true,
      },
    ]);

    try {
      await streamChatMessage(
        { thread_id: activeThread, user_id: userId, message: clean },
        {
          onEvent: (eventName, raw) => {
            const data = raw as Record<string, unknown>;
            if (eventName === "error") {
              setErrorBanner(String(data.message ?? "Error ejecutando el agente."));
              return;
            }
            if (eventName === "interrupt") {
              setPendingInterrupt(data as unknown as HITLInterruptPayload);
              setTurns((prev) =>
                prev.map((t) => (t.id === turnId ? { ...t, isStreaming: false } : t)),
              );
              return;
            }
            if (
              eventName === "memory" ||
              eventName === "router" ||
              eventName === "thought" ||
              eventName === "action" ||
              eventName === "observation"
            ) {
              const step = data as unknown as ReActStep;
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === turnId
                    ? {
                        ...t,
                        routerDecision:
                          eventName === "router"
                            ? (step.detail as unknown as RouterDecision)
                            : t.routerDecision,
                        steps: [...t.steps, step],
                      }
                    : t,
                ),
              );
              return;
            }
            if (eventName === "token") {
              const delta = String(data.delta ?? "");
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === turnId ? { ...t, assistantAnswer: t.assistantAnswer + delta } : t,
                ),
              );
              return;
            }
            if (eventName === "citations") {
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === turnId
                    ? {
                        ...t,
                        citations: (data.citations ?? []) as CitationItem[],
                        shieldTriggered: Boolean(data.shield_triggered),
                        blockedAlerts: (data.blocked_alerts ?? []) as Array<
                          Record<string, unknown>
                        >,
                      }
                    : t,
                ),
              );
              return;
            }
            if (eventName === "done") {
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === turnId
                    ? {
                        ...t,
                        assistantAnswer: String(data.answer ?? t.assistantAnswer),
                        routerDecision:
                          (data.router_decision as RouterDecision) ?? t.routerDecision,
                        citations: (data.citations as CitationItem[]) ?? t.citations,
                        shieldTriggered: Boolean(data.shield_triggered),
                        checkpointId: (data.checkpoint_id as string) ?? null,
                        latencyMs: Number(data.latency_ms ?? 0),
                        isStreaming: false,
                      }
                    : t,
                ),
              );
            }
          },
          onError: (msg) => setErrorBanner(msg),
        },
      );
    } finally {
      setIsStreaming(false);
      await syncSidebarData(activeThread, userId);
    }
  };

  const handleResolveHITL = async (
    decision: "approve" | "edit" | "reject",
    editedArgs?: Record<string, unknown>,
  ) => {
    setIsStreaming(true);
    const turnId = `hitl-${Date.now()}`;
    setTurns((prev) => [
      ...prev,
      {
        id: turnId,
        userQuery: `[Decisión Humana HITL: ${decision.toUpperCase()}]`,
        assistantAnswer: "",
        steps: [],
        citations: [],
        shieldTriggered: false,
        blockedAlerts: [],
        isStreaming: true,
      },
    ]);

    try {
      await resumeHITLDecision(
        { thread_id: threadId, user_id: userId, decision, edited_args: editedArgs },
        {
          onEvent: (eventName, raw) => {
            const data = raw as Record<string, unknown>;
            if (eventName === "action" || eventName === "observation") {
              const step = data as unknown as ReActStep;
              setTurns((prev) =>
                prev.map((t) => (t.id === turnId ? { ...t, steps: [...t.steps, step] } : t)),
              );
            } else if (eventName === "token") {
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === turnId
                    ? { ...t, assistantAnswer: t.assistantAnswer + String(data.delta ?? "") }
                    : t,
                ),
              );
            } else if (eventName === "done") {
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === turnId
                    ? {
                        ...t,
                        assistantAnswer: String(data.answer ?? t.assistantAnswer),
                        latencyMs: Number(data.latency_ms ?? 0),
                        isStreaming: false,
                      }
                    : t,
                ),
              );
            }
          },
          onError: (msg) => setErrorBanner(msg),
        },
      );
      setPendingInterrupt(null);
    } finally {
      setIsStreaming(false);
      await syncSidebarData(threadId, userId);
    }
  };

  const handleNewThread = () => {
    const fresh = generateThreadId();
    setThreadId(fresh);
    setTurns([]);
    setPendingInterrupt(null);
  };

  const handleFork = async (checkpointId: string) => {
    const res = await forkThread(threadId, checkpointId);
    setThreadId(res.new_thread_id);
  };

  const handleToggleTrap = async (enabled: boolean) => {
    const res = await toggleInjectionTrap(enabled);
    setHealth((prev) => (prev ? { ...prev, qdrant_stats: res.stats } : prev));
  };

  const launchInjectionDemo = async () => {
    await handleToggleTrap(true);
    await sendQuery("¿Qué dice el documento de auditoría sobre seguridad y medicamentos gratis?");
  };

  const handleShutdownSystem = async () => {
    if (isShuttingDown) return;
    setIsShuttingDown(true);
    setErrorBanner(null);
    try {
      await shutdownSystem();
      setIsPoweredOff(true);
      window.setTimeout(() => {
        window.close();
      }, 650);
    } catch (err) {
      setIsShuttingDown(false);
      setErrorBanner(
        err instanceof Error ? err.message : "No se pudo ejecutar el apagado del backend.",
      );
    }
  };

  const activeTurn = turns[turns.length - 1];
  const trapEnabled = Boolean(health?.qdrant_stats?.trap_enabled);

  if (isPoweredOff) {
    return (
      <div className="cyber-grid-bg cyber-scanlines flex h-screen w-full items-center justify-center bg-[#08080a] p-6 text-[#eef4fc]">
        <div className="holo-panel max-w-md rounded-2xl border border-[#d4ff00]/45 p-7 text-center shadow-[0_0_40px_rgba(0,245,255,0.14)]">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#d4ff00]/60 bg-[#d4ff00]/12 text-[#d4ff00]">
            <Power className="h-7 w-7" />
          </div>
          <h1 className="text-lg font-bold text-white">Sistema Tecnoquímicas AI Apagado</h1>
          <p className="mt-2 text-xs leading-relaxed text-[#cbd5e1]">
            FastAPI, Vite, SQLite y Qdrant se cerraron de forma segura y los puertos TCP quedaron
            libres. Ya puedes cerrar esta pestaña o volver a iniciar desde tu acceso directo en el
            Escritorio.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="cyber-grid-bg cyber-scanlines flex h-screen w-full overflow-hidden bg-[#08080a] text-[#eef4fc]">
      {/* Rail Izquierdo: Marca + Hilos Durables */}
      <aside className="hidden md:flex w-[278px] shrink-0 flex-col border-r border-white/10 bg-[#0f0f15]/92 backdrop-blur-xl">
        <div className="border-b border-white/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white">
                TECNOQUÍMICAS <span className="text-[#00f5ff]">AI</span>
              </h1>
              <p className="font-mono text-[10px] text-[#8b9bb4]">
                {activeModule === "m1"
                  ? "KNOWLEDGE CORE · MÓDULO 1"
                  : "BIO-REACTOR 3D · MÓDULO 2"}
              </p>
            </div>
            <span
              className={`relative h-2.5 w-2.5 rounded-full ${
                health?.status === "ok"
                  ? "bg-[#d4ff00] shadow-[0_0_10px_#d4ff00]"
                  : "bg-[#ff4d00] shadow-[0_0_10px_#ff4d00]"
              }`}
              title={health?.status === "ok" ? "Backend FastAPI conectado" : "Desconectado"}
            />
          </div>

          <div
            className="mt-3 grid grid-cols-2 gap-1.5 rounded-xl border border-white/10 bg-[#08080a] p-1"
            role="tablist"
            aria-label="Selector de módulo"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeModule === "m2"}
              onClick={() => setActiveModule("m2")}
              className={`rounded-lg px-2 py-1.5 font-mono text-[10px] font-semibold transition-all ${
                activeModule === "m2"
                  ? "bg-[#00f5ff]/18 text-[#00f5ff] shadow-[0_0_12px_rgba(0,245,255,0.2)] border border-[#00f5ff]/45"
                  : "text-[#8b9bb4] hover:text-[#eef4fc] border border-transparent"
              }`}
            >
              Módulo 2 · 3D
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeModule === "m1"}
              onClick={() => setActiveModule("m1")}
              className={`rounded-lg px-2 py-1.5 font-mono text-[10px] font-semibold transition-all ${
                activeModule === "m1"
                  ? "bg-[#d4ff00]/18 text-[#d4ff00] shadow-[0_0_12px_rgba(212,255,0,0.2)] border border-[#d4ff00]/45"
                  : "text-[#8b9bb4] hover:text-[#eef4fc] border border-transparent"
              }`}
            >
              Módulo 1 · Core
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setActiveModule("m2");
              handleNewThread();
            }}
            className="mt-2.5 flex min-h-[38px] w-full items-center justify-center gap-2 rounded-xl bg-[#00f5ff] px-3 py-2 text-xs font-bold text-[#08080a] shadow-[0_0_18px_rgba(0,245,255,0.28)] transition-all hover:brightness-110"
          >
            <MessageSquarePlus className="h-4 w-4" />
            Crear hilo durable
          </button>

          <label className="mt-3 block">
            <span className="mb-1 block font-mono text-[10px] text-[#8b9bb4]">
              Identificador de memoria (`Store`)
            </span>
            <div className="flex items-center gap-2 rounded-lg border border-white/12 bg-[#08080a] px-2.5 py-1.5 focus-within:border-[#00f5ff]/60">
              <User className="h-3.5 w-3.5 text-[#00f5ff]" />
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value || "default_user")}
                aria-label="User ID para Store"
                className="w-full bg-transparent font-mono text-[11px] text-[#eef4fc] outline-none"
                placeholder="user_id (Store)"
              />
            </div>
          </label>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto p-2.5">
          <div className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[#8b9bb4]">
            Hilos persistidos (SqliteSaver)
          </div>
          {threads.map((th) => {
            const active = th.thread_id === threadId;
            return (
              <div
                key={th.thread_id}
                onClick={() => setThreadId(th.thread_id)}
                className={`group flex cursor-pointer items-center justify-between rounded-xl border px-2.5 py-2 text-xs transition-all ${
                  active
                    ? "border-[#00f5ff]/55 bg-[#00f5ff]/10 text-white shadow-[0_0_16px_rgba(0,245,255,0.1)]"
                    : "border-transparent text-[#a8bad3] hover:border-white/10 hover:bg-white/5"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{th.title}</p>
                  <p className="font-mono text-[10px] text-[#8b9bb4]">
                    {th.turns} turnos · {th.last_choice || "NUEVO"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteThread(th.thread_id).then(() => {
                      if (active) handleNewThread();
                      else void syncSidebarData(threadId, userId);
                    });
                  }}
                  aria-label={`Eliminar hilo ${th.title}`}
                  title="Eliminar hilo"
                  className="rounded p-1 text-[#8b9bb4] opacity-0 transition-opacity hover:text-[#ff4d00] group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="space-y-1.5 border-t border-white/10 bg-[#08080a]/75 p-3 font-mono text-[10px] text-[#8b9bb4]">
          <div className="flex items-center justify-between gap-2">
            <span>MOTOR LLM:</span>
            <span className="truncate font-semibold text-[#d4ff00]">
              {health?.llm_model ?? "llama3.2"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>RESPALDO:</span>
            <span className="text-[#00f5ff]">
              {health?.ollama_available ? "ONLINE" : "DETERMINISTA"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>LANGSMITH:</span>
            <span className={health?.langsmith_tracing ? "text-[#d4ff00]" : "text-[#8b9bb4]"}>
              {health?.langsmith_tracing ? "TRACING ACTIVO" : "STANDBY (.env)"}
            </span>
          </div>
        </div>
      </aside>

      {/* Área Central: HUD + Reactor 3D + Streaming ReAct + HITL */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="border-b border-white/10 bg-[#0f0f15]/80 px-4 py-2.5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {activeModule === "m1" ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Layers className="h-4 w-4 text-[#d4ff00]" />
                <span className="font-semibold text-[#eef4fc]">
                  Módulo 1 · Knowledge Core
                </span>
                <code className="rounded border border-[#d4ff00]/35 bg-[#08080a] px-2 py-0.5 font-mono text-[11px] text-[#d4ff00]">
                  {health?.llm_model ?? "gemini-3.8-flash"}
                </code>
                <span className="hidden xl:inline text-[11px] text-[#8b9bb4]">
                  LCEL Grounded + Medallion Gold + Archify
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Activity className="h-4 w-4 text-[#00f5ff]" />
                <span className="font-semibold text-[#eef4fc]">Thread ID:</span>
                <code className="rounded border border-[#00f5ff]/30 bg-[#08080a] px-2 py-0.5 font-mono text-[11px] text-[#00f5ff]">
                  {threadId}
                </code>
                <span className="hidden xl:inline text-[11px] text-[#8b9bb4]">
                  Persistencia durable SQLite ante recarga F5
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-lg border border-white/12 bg-[#08080a] p-0.5">
                <button
                  type="button"
                  onClick={() => setActiveModule("m2")}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors ${
                    activeModule === "m2"
                      ? "bg-[#00f5ff]/18 text-[#00f5ff]"
                      : "text-[#8b9bb4] hover:text-[#eef4fc]"
                  }`}
                >
                  Módulo 2 · Agente 3D
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModule("m1")}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors ${
                    activeModule === "m1"
                      ? "bg-[#d4ff00]/18 text-[#d4ff00]"
                      : "text-[#8b9bb4] hover:text-[#eef4fc]"
                  }`}
                >
                  <Layers className="h-3 w-3" />
                  Módulo 1 · Knowledge Core
                </button>
              </div>

              {activeModule === "m2" && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowReactor((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-colors ${
                      showReactor
                        ? "border-[#00f5ff]/50 bg-[#00f5ff]/12 text-[#00f5ff]"
                        : "border-white/15 bg-[#161622] text-[#cbd5e1] hover:border-white/30"
                    }`}
                  >
                    <Box className="h-3.5 w-3.5" />
                    {showReactor ? "Ocultar 3D" : "Ver Reactor 3D"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowInspector((s) => !s)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#161622] px-2.5 py-1.5 text-xs font-medium text-[#eef4fc] transition-colors hover:border-[#00f5ff]/45"
                  >
                    {showInspector ? (
                      <>
                        <PanelRightClose className="h-3.5 w-3.5 text-[#00f5ff]" /> Ocultar telemetría
                      </>
                    ) : (
                      <>
                        <PanelRightOpen className="h-3.5 w-3.5 text-[#00f5ff]" /> Ver telemetría
                      </>
                    )}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => void handleShutdownSystem()}
                disabled={isShuttingDown}
                title="Apagar FastAPI, Vite, SQLite/Qdrant y liberar los puertos TCP"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#ff4d00]/55 bg-[#ff4d00]/15 px-2.5 py-1.5 font-mono text-[11px] font-semibold text-[#ff9366] transition-colors hover:bg-[#ff4d00]/28 disabled:opacity-50"
              >
                <Power className="h-3.5 w-3.5" />
                {isShuttingDown ? "Apagando..." : "Apagar sistema"}
              </button>
            </div>
          </div>

          {/* Barra de Casos de Sustentación en 1 Clic */}
          {activeModule === "m2" && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-mono text-[10px] uppercase tracking-wider text-[#8b9bb4]">
              Casos Demo:
            </span>
            <button
              type="button"
              onClick={() =>
                void sendQuery(
                  "¿Qué dice el corpus sobre la política de calidad, certificaciones BPM y estudios científicos de TQ?",
                )
              }
              className="rounded-md border border-[#d4ff00]/35 bg-[#d4ff00]/10 px-2.5 py-1 text-[11px] font-medium text-[#d4ff00] transition-colors hover:bg-[#d4ff00]/20"
            >
              1. RAG Documental
            </button>
            <button
              type="button"
              onClick={() =>
                void sendQuery(
                  "Hola, me llamo Ana Martínez, soy Directora de Compras y trabajo en Carvajal. Prefiero respuestas ejecutivas.",
                )
              }
              className="rounded-md border border-[#00f5ff]/35 bg-[#00f5ff]/10 px-2.5 py-1 text-[11px] font-medium text-[#00f5ff] transition-colors hover:bg-[#00f5ff]/20"
            >
              2A. Guardar Memoria
            </button>
            <button
              type="button"
              onClick={() => {
                const fresh = generateThreadId();
                void sendQuery("¿Recuerdas cómo me llamo y dónde trabajo?", fresh);
              }}
              className="rounded-md border border-[#00f5ff]/35 bg-[#00f5ff]/10 px-2.5 py-1 text-[11px] font-medium text-[#00f5ff] transition-colors hover:bg-[#00f5ff]/20"
            >
              2B. Nuevo Hilo + Store
            </button>
            <button
              type="button"
              onClick={() =>
                void sendQuery(
                  "¿Cuántas unidades se vendieron y cuáles fueron los ingresos en el tercer trimestre de 2025?",
                )
              }
              className="rounded-md border border-[#00f5ff]/35 bg-[#161622] px-2.5 py-1 text-[11px] font-medium text-[#7ef9ff] transition-colors hover:border-[#00f5ff]"
            >
              3. Datos CSV Exactos
            </button>
            <button
              type="button"
              onClick={() =>
                void sendQuery(
                  "Compara la meta de calidad del documento con las ventas reales del tercer trimestre en el CSV.",
                )
              }
              className="rounded-md border border-[#ffe600]/40 bg-[#ffe600]/10 px-2.5 py-1 text-[11px] font-medium text-[#ffe600] transition-colors hover:bg-[#ffe600]/20"
            >
              4. Router Mixto
            </button>
            <button
              type="button"
              onClick={() => void sendQuery("¡Hola! Buenos días, ¿cómo estás hoy?")}
              className="rounded-md border border-white/15 bg-[#161622] px-2.5 py-1 text-[11px] font-medium text-[#cbd5e1] transition-colors hover:border-white/35"
            >
              4B. Saludo (0 RAG)
            </button>
            <button
              type="button"
              onClick={() => void launchInjectionDemo()}
              className="inline-flex items-center gap-1 rounded-md border border-[#ff4d00]/55 bg-[#ff4d00]/15 px-2.5 py-1 text-[11px] font-medium text-[#ff9366] transition-colors hover:bg-[#ff4d00]/25"
            >
              <ShieldAlert className="h-3 w-3" />
              5. Blindaje RAG
            </button>
            <button
              type="button"
              onClick={() =>
                void sendQuery("Genera la orden oficial de exportación de auditoría Q3 2025")
              }
              className="rounded-md border border-[#ffe600]/55 bg-[#ffe600]/15 px-2.5 py-1 text-[11px] font-semibold text-[#ffe600] transition-colors hover:bg-[#ffe600]/25"
            >
              HITL en vivo
            </button>
          </div>
          )}
        </header>

        {activeModule === "m1" ? (
          <Modulo1Workspace health={health} />
        ) : (
          <>
            {/* Reactor 3D en Vivo acoplado al flujo SSE */}
            {showReactor && (
          <AgentReactor3D
            activeTurn={activeTurn}
            isStreaming={isStreaming}
            pendingInterrupt={pendingInterrupt}
            trapEnabled={trapEnabled}
            llmModel={health?.llm_model}
            langsmithActive={health?.langsmith_tracing}
            qdrantPoints={health?.qdrant_stats?.points_count}
            expanded={reactorExpanded}
            onToggleExpand={() => setReactorExpanded((v) => !v)}
          />
        )}

        {errorBanner && (
          <div className="mx-4 mt-3 rounded-xl border border-[#ff4d00]/65 bg-[#ff4d00]/12 px-3.5 py-2.5 text-xs text-[#ffb08e]">
            {errorBanner}
          </div>
        )}

        <div className="perspective-stage flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {turns.length === 0 && !pendingInterrupt && (
            <div className="holo-panel holo-card-3d mx-auto mt-3 max-w-2xl rounded-2xl p-6 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-[#00f5ff]/45 bg-[#00f5ff]/12 text-[#00f5ff] shadow-[0_0_24px_rgba(0,245,255,0.2)]">
                <Sparkles className="h-5 w-5" />
              </div>
              <h2 className="text-base font-bold tracking-tight text-white">
                Núcleo Bio-Reactor 3D · Tecnoquímicas S.A.
              </h2>
              <p className="mx-auto mt-2 max-w-[68ch] text-xs leading-relaxed text-[#a8bad3]">
                Observa en el escenario 3D superior cómo viajan los flujos entre Memoria Dual,
                Gatekeeper Jev, Qdrant RRF, CSV Determinista, Escudo Anti-Inyección, Control HITL y{" "}
                <span className="font-mono text-[#d4ff00]">
                  {health?.llm_model ?? "gemini-3.8-flash"}
                </span>{" "}
                en cada consulta o caso de demostración.
              </p>
            </div>
          )}

          {turns.map((turn) => (
            <div key={turn.id} className="mx-auto max-w-4xl space-y-3">
              <div className="flex justify-end">
                <div className="max-w-[82%] rounded-2xl rounded-tr-sm border border-[#00f5ff]/40 bg-[#161622] px-4 py-2.5 text-sm text-[#eef4fc] shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
                  {turn.userQuery}
                </div>
              </div>

              <div className="holo-panel holo-card-3d rounded-2xl p-4">
                <ReActTimeline
                  routerDecision={turn.routerDecision}
                  steps={turn.steps}
                  shieldTriggered={turn.shieldTriggered}
                  isStreaming={turn.isStreaming}
                  latencyMs={turn.latencyMs}
                />

                {turn.assistantAnswer ? (
                  <FormattedAnswer text={turn.assistantAnswer} />
                ) : (
                  turn.isStreaming && (
                    <div className="flex items-center gap-2 py-1 font-mono text-xs text-[#00f5ff]">
                      <span className="h-2 w-2 rounded-full bg-[#00f5ff] animate-pulse" />
                      Sintetizando respuesta verificada en núcleo 3D...
                    </div>
                  )
                )}

                {turn.citations.length > 0 && (
                  <div className="mt-3.5 border-t border-white/10 pt-3">
                    <p className="mb-2 font-mono text-[11px] font-semibold text-[#8b9bb4]">
                      Evidencia Qdrant recuperada ({turn.citations.length} fragmentos):
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {turn.citations.map((c) => (
                        <a
                          key={c.chunk_id}
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] transition-all ${
                            c.is_injection_trap
                              ? "border-[#ff4d00]/65 bg-[#ff4d00]/15 text-[#ff9366]"
                              : "border-white/12 bg-[#08080a] text-[#dbe6f5] hover:border-[#00f5ff]/55 hover:text-[#00f5ff]"
                          }`}
                        >
                          <span className="font-medium">{c.section}</span>
                          <span className="font-mono text-[10px] text-[#d4ff00]">
                            ({c.score.toFixed(2)})
                          </span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {pendingInterrupt && (
            <div className="mx-auto max-w-4xl">
              <HITLBanner
                interrupt={pendingInterrupt}
                isSubmitting={isStreaming}
                onResolve={(d, args) => void handleResolveHITL(d, args)}
              />
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendQuery(input);
          }}
          className={`border-t bg-[#0f0f15]/90 px-4 py-3 backdrop-blur-xl transition-colors ${
            isStreaming ? "border-[#00f5ff]/55" : "border-white/10"
          }`}
        >
          <div className="mx-auto flex max-w-4xl items-end gap-2.5">
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendQuery(input);
                }
              }}
              aria-label="Consulta para el agente Tecnoquímicas"
              placeholder="Consulta documentos de TQ, ventas trimestrales CSV, memoria entre hilos o solicita auditoría HITL..."
              className="flex-1 resize-none rounded-xl border border-white/15 bg-[#08080a] px-3.5 py-2.5 text-sm text-[#eef4fc] placeholder:text-[#667791] outline-none transition-all focus:border-[#00f5ff] focus:shadow-[0_0_16px_rgba(0,245,255,0.16)]"
            />
            <button
              type="submit"
              disabled={isStreaming || !input.trim()}
              className="inline-flex h-[46px] items-center gap-2 rounded-xl bg-[#00f5ff] px-4 text-xs font-bold text-[#08080a] shadow-[0_0_18px_rgba(0,245,255,0.28)] transition-all hover:brightness-110 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
              {isStreaming ? "Procesando..." : "Ejecutar consulta"}
            </button>
          </div>
        </form>
          </>
        )}
      </main>

      {/* Panel Derecho: Cabina de Telemetría 3D */}
      {activeModule === "m2" && showInspector && (
        <div className="hidden lg:block w-[360px] shrink-0">
          <InspectorPanel
            userId={userId}
            threadId={threadId}
            storeProfile={storeProfile}
            checkpoints={checkpoints}
            health={health}
            evalMetrics={evalMetrics}
            onForkCheckpoint={(cpId) => void handleFork(cpId)}
            onToggleTrap={(en) => void handleToggleTrap(en)}
          />
        </div>
      )}
    </div>
  );
}

export default App;
