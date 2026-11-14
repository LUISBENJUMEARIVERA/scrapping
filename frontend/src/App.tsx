import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ExternalLink,
  MessageSquarePlus,
  PanelRightClose,
  PanelRightOpen,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { HITLBanner } from "./components/HITLBanner";
import { InspectorPanel } from "./components/InspectorPanel";
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
    <div className="space-y-1.5 text-sm leading-relaxed text-slate-800">
      {lines.map((line, idx) => {
        if (line.startsWith("### ")) {
          return (
            <h4 key={idx} className="pt-1 text-sm font-semibold text-[#0B1F3A]">
              {line.slice(4)}
            </h4>
          );
        }
        if (line.startsWith("> ")) {
          return (
            <div
              key={idx}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900"
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
          <p key={idx} className={line.startsWith("- ") ? "pl-3 text-[13px]" : "text-[14px]"}>
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
          err instanceof Error ? err.message : "Backend FastAPI inaccesible en puerto 8000.",
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
              setErrorBanner(String(data.message ?? "Error en el agente."));
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

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#F7F9FC] text-[#0B1F3A]">
      {/* Rail Izquierdo: Marca + Hilos Durables */}
      <aside className="hidden md:flex w-[270px] shrink-0 flex-col bg-[#0B1F3A] text-slate-100">
        <div className="border-b border-white/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white">Tecnoquímicas AI</h1>
              <p className="text-[11px] text-slate-300">Agente LangGraph · Módulo 2</p>
            </div>
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                health?.status === "ok" ? "bg-emerald-400" : "bg-rose-400"
              }`}
              title={health?.status === "ok" ? "Backend FastAPI conectado" : "Desconectado"}
            />
          </div>

          <button
            type="button"
            onClick={handleNewThread}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#0052CC] px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600 transition-colors"
          >
            <MessageSquarePlus className="h-4 w-4" />
            Nuevo hilo durable
          </button>

          <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
            <User className="h-3.5 w-3.5 text-slate-300" />
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value || "default_user")}
              aria-label="User ID para Store"
              className="w-full bg-transparent font-mono text-[11px] text-white outline-none"
              placeholder="user_id (Store)"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="px-2 py-1 text-[11px] font-medium text-slate-400">
            Hilos persistidos (`SqliteSaver`)
          </div>
          {threads.map((th) => {
            const active = th.thread_id === threadId;
            return (
              <div
                key={th.thread_id}
                className={`group flex items-center justify-between rounded-lg px-2.5 py-2 text-xs cursor-pointer transition-colors ${
                  active ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/10"
                }`}
                onClick={() => setThreadId(th.thread_id)}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{th.title}</p>
                  <p className="font-mono text-[10px] text-slate-400">
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
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-300"
                  title="Eliminar hilo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="border-t border-white/10 p-3 text-[11px] text-slate-300 space-y-1 font-mono">
          <div className="flex justify-between">
            <span>LLM:</span>
            <span className="text-white">
              {health?.llm_model ?? "llama3.2"} ({health?.ollama_available ? "live" : "fallback"})
            </span>
          </div>
          <div className="flex justify-between">
            <span>LangSmith:</span>
            <span>{health?.langsmith_tracing ? "activo" : "config (.env)"}</span>
          </div>
        </div>
      </aside>

      {/* Área Central: Chat + Casos de Sustentación + Streaming ReAct + HITL */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <Activity className="h-4 w-4 text-[#0052CC]" />
              <span className="font-semibold">Thread ID:</span>
              <code className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                {threadId}
              </code>
              <span className="hidden sm:inline text-slate-400">
                (Recarga F5 o reinicia FastAPI sin perder historial)
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowInspector((s) => !s)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {showInspector ? (
                <>
                  <PanelRightClose className="h-3.5 w-3.5" /> Ocultar inspector
                </>
              ) : (
                <>
                  <PanelRightOpen className="h-3.5 w-3.5" /> Ver inspector
                </>
              )}
            </button>
          </div>

          {/* Barra de Casos de Sustentación en 1 Clic */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-500 mr-1">Demo rápida:</span>
            <button
              type="button"
              onClick={() =>
                void sendQuery(
                  "¿Qué dice el corpus sobre la política de calidad, certificaciones BPM y estudios científicos de TQ?",
                )
              }
              className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-800 hover:bg-blue-100"
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
              className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-800 hover:bg-indigo-100"
            >
              2A. Guardar Memoria
            </button>
            <button
              type="button"
              onClick={() => {
                const fresh = generateThreadId();
                void sendQuery("¿Recuerdas cómo me llamo y dónde trabajo?", fresh);
              }}
              className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-800 hover:bg-indigo-100"
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
              className="rounded-md border border-teal-200 bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-800 hover:bg-teal-100"
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
              className="rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-800 hover:bg-violet-100"
            >
              4. Router Mixto
            </button>
            <button
              type="button"
              onClick={() => void sendQuery("¡Hola! Buenos días, ¿cómo estás hoy?")}
              className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200"
            >
              4B. Saludo (0 RAG)
            </button>
            <button
              type="button"
              onClick={() => void launchInjectionDemo()}
              className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-800 hover:bg-rose-100"
            >
              <ShieldAlert className="h-3 w-3" />
              5. Blindaje RAG
            </button>
            <button
              type="button"
              onClick={() =>
                void sendQuery("Genera la orden oficial de exportación de auditoría Q3 2025")
              }
              className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
            >
              HITL en vivo
            </button>
          </div>
        </header>

        {errorBanner && (
          <div className="mx-4 mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {errorBanner}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {turns.length === 0 && !pendingInterrupt && (
            <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 text-center mt-8">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-[#0052CC]">
                <Sparkles className="h-5 w-5" />
              </div>
              <h2 className="text-base font-semibold text-[#0B1F3A]">
                Núcleo Agéntico Tecnoquímicas S.A.
              </h2>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Arquitectura desacoplada React + FastAPI + LangGraph con streaming de pasos ReAct,
                memoria durable en SQLite, Store por namespaces, Qdrant híbrido (Densa + Léxica RRF),
                Gatekeeper Jev, blindaje anti-inyección y pausa HITL en vivo.
              </p>
            </div>
          )}

          {turns.map((turn) => (
            <div key={turn.id} className="mx-auto max-w-4xl space-y-2.5">
              <div className="flex justify-end">
                <div className="max-w-[82%] rounded-2xl rounded-tr-sm bg-[#0B1F3A] px-4 py-2.5 text-sm text-white">
                  {turn.userQuery}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
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
                    <p className="text-xs font-mono text-slate-500">
                      Sintetizando respuesta verificada...
                    </p>
                  )
                )}

                {turn.citations.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-2.5">
                    <p className="text-[11px] font-semibold text-slate-500 mb-1.5">
                      Evidencia Qdrant recuperada ({turn.citations.length} fragmentos):
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {turn.citations.map((c) => (
                        <a
                          key={c.chunk_id}
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors ${
                            c.is_injection_trap
                              ? "border-rose-300 bg-rose-50 text-rose-800"
                              : "border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:text-[#0052CC]"
                          }`}
                        >
                          <span className="font-medium">{c.section}</span>
                          <span className="font-mono text-[10px] text-slate-500">
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
          className="border-t border-slate-200 bg-white px-4 py-3"
        >
          <div className="mx-auto flex max-w-4xl items-end gap-2">
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
              placeholder="Consulta documentos de TQ, ventas trimestrales CSV, memoria entre hilos o solicita auditoría HITL..."
              className="flex-1 resize-none rounded-xl border border-slate-300 bg-[#F7F9FC] px-3.5 py-2.5 text-sm text-[#0B1F3A] outline-none focus:border-[#0052CC] focus:bg-white transition-colors"
            />
            <button
              type="submit"
              disabled={isStreaming || !input.trim()}
              className="inline-flex h-[44px] items-center gap-2 rounded-xl bg-[#0052CC] px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              <Send className="h-4 w-4" />
              Enviar
            </button>
          </div>
        </form>
      </main>

      {/* Panel Derecho: Inspector de Memoria, Qdrant Shield y Benchmark */}
      {showInspector && (
        <div className="hidden lg:block w-[350px] shrink-0">
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
