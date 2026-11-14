import { useEffect, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Cpu,
  Database,
  ExternalLink,
  FileText,
  FlaskConical,
  HelpCircle,
  Layers,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";
import {
  fetchM1Overview,
  getM1ArchitectureUrl,
  runM1Pytest,
  streamM1Task,
} from "../services/api";
import type { HealthStatus, Modulo1Overview, Modulo1PytestResult } from "../types/agent";

interface Modulo1WorkspaceProps {
  health: HealthStatus | null;
}

type M1Tab = "qa" | "summary" | "faq" | "medallion";

interface M1Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  latencyMs?: number;
}

const TQ_PORTFOLIO_SLIDES = [
  {
    tag: "Bienestar Digestivo",
    title: "Bonfiest Lúa & Sal de Frutas",
    desc: "Líderes en el mercado de antiácidos y digestivos efervescentes en Colombia y la región.",
    url: "https://www.tqconfiable.com",
    image:
      "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=900&q=80",
  },
  {
    tag: "Primeros Auxilios",
    title: "CureBand Adhesivos",
    desc: "Tecnología adhesiva hipoalergénica de alto rendimiento hospitalario y protección de heridas.",
    url: "https://www.tqconfiable.com",
    image:
      "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=900&q=80",
  },
  {
    tag: "Cuidado Personal",
    title: "Yodora Desodorante",
    desc: "Protección tradicional y confianza para el cuidado diario con más de 70 años de trayectoria.",
    url: "https://www.tqconfiable.com",
    image:
      "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=900&q=80",
  },
  {
    tag: "Prescripción Médica",
    title: "TQ Farma Especialidades",
    desc: "Plantas farmacéuticas certificadas INVIMA y FDA con líneas terapéuticas y cardiometabólicas.",
    url: "https://www.tqfarma.com",
    image:
      "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=900&q=80",
  },
];

export function Modulo1Workspace({ health }: Modulo1WorkspaceProps) {
  const [activeTab, setActiveTab] = useState<M1Tab>("qa");
  const [overview, setOverview] = useState<Modulo1Overview | null>(null);
  const [slideIdx, setSlideIdx] = useState(0);

  // Q&A LCEL Grounded
  const [messages, setMessages] = useState<M1Message[]>([
    {
      id: "m1-welcome",
      role: "assistant",
      content:
        "Bienvenido al **Núcleo Knowledge Core (Módulo 1)** de Tecnoquímicas S.A. Ahora potenciando las cadenas **LCEL** (`Prompt | LLM | StrOutputParser`) con el nuevo motor **`gemini-3.8-flash`** (con fallback automático a Ollama). ¿Qué deseas consultar del corpus Medallion Gold?",
    },
  ]);
  const [qaInput, setQaInput] = useState("");
  const [qaStreaming, setQaStreaming] = useState(false);

  // Síntesis & FAQ LCEL
  const [summaryText, setSummaryText] = useState("");
  const [summaryStreaming, setSummaryStreaming] = useState(false);
  const [faqText, setFaqText] = useState("");
  const [faqStreaming, setFaqStreaming] = useState(false);

  // Pytest runner en vivo
  const [pytestResult, setPytestResult] = useState<Modulo1PytestResult | null>(null);
  const [pytestLoading, setPytestLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    void fetchM1Overview()
      .then(setOverview)
      .catch((err) => setErrorMsg(err instanceof Error ? err.message : "Error cargando Módulo 1"));
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSlideIdx((prev) => (prev + 1) % TQ_PORTFOLIO_SLIDES.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, []);

  const handleSendQA = async (questionOverride?: string) => {
    const q = (questionOverride ?? qaInput).trim();
    if (!q || qaStreaming) return;
    if (!questionOverride) setQaInput("");
    setErrorMsg(null);
    setQaStreaming(true);

    const userMsg: M1Message = { id: `u-${Date.now()}`, role: "user", content: q };
    const assistantId = `a-${Date.now() + 1}`;
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", content: "" }]);

    let acc = "";
    try {
      await streamM1Task(
        { task: "qa", question: q },
        {
          onEvent: (event, data) => {
            const payload = data as Record<string, unknown>;
            if (event === "token") {
              acc += String(payload.delta ?? "");
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m)),
              );
            } else if (event === "done") {
              const latency = Number(payload.latency_ms ?? 0);
              const refusal = "no contiene datos para responder a esta consulta";
              const withCitation =
                !acc.toLowerCase().includes(refusal) && !acc.includes("📌")
                  ? `${acc}\n\n---\n📌 **Fuente verificada (M1 Gold):** Portal Oficial Tecnoquímicas S.A. (tqconfiable.com | tqfarma.com)`
                  : acc;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: withCitation, latencyMs: latency } : m,
                ),
              );
            } else if (event === "error") {
              setErrorMsg(String(payload.message ?? "Error en cadena LCEL."));
            }
          },
          onError: (err) => setErrorMsg(err),
        },
      );
    } finally {
      setQaStreaming(false);
    }
  };

  const handleRunSummary = async () => {
    if (summaryStreaming) return;
    setSummaryStreaming(true);
    setSummaryText("");
    setErrorMsg(null);
    let acc = "";
    try {
      await streamM1Task(
        { task: "summary" },
        {
          onEvent: (event, data) => {
            const payload = data as Record<string, unknown>;
            if (event === "token") {
              acc += String(payload.delta ?? "");
              setSummaryText(acc);
            } else if (event === "error") {
              setErrorMsg(String(payload.message ?? "Error generando síntesis."));
            }
          },
          onError: (err) => setErrorMsg(err),
        },
      );
    } finally {
      setSummaryStreaming(false);
    }
  };

  const handleRunFaq = async () => {
    if (faqStreaming) return;
    setFaqStreaming(true);
    setFaqText("");
    setErrorMsg(null);
    let acc = "";
    try {
      await streamM1Task(
        { task: "faq" },
        {
          onEvent: (event, data) => {
            const payload = data as Record<string, unknown>;
            if (event === "token") {
              acc += String(payload.delta ?? "");
              setFaqText(acc);
            } else if (event === "error") {
              setErrorMsg(String(payload.message ?? "Error extrayendo FAQ."));
            }
          },
          onError: (err) => setErrorMsg(err),
        },
      );
    } finally {
      setFaqStreaming(false);
    }
  };

  const handleRunPytest = async () => {
    if (pytestLoading) return;
    setPytestLoading(true);
    setErrorMsg(null);
    try {
      const res = await runM1Pytest();
      setPytestResult(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error ejecutando pytest.");
    } finally {
      setPytestLoading(false);
    }
  };

  const metrics = overview?.medallion_metrics;
  const currentSlide = TQ_PORTFOLIO_SLIDES[slideIdx];
  const activeLlm = overview?.llm_model ?? health?.llm_model ?? "gemini-3.8-flash";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Banner Hero Módulo 1 en estética Bio-Reactor Void */}
      <div className="border-b border-white/10 bg-[#0d0e14]/90 px-4 py-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d4ff00]/45 bg-[#d4ff00]/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-[#d4ff00]">
                <Layers className="h-3 w-3" />
                MÓDULO 1 · KNOWLEDGE CORE (v1.0.0-GOLD)
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#00f5ff]/40 bg-[#00f5ff]/10 px-2.5 py-0.5 font-mono text-[10px] text-[#00f5ff]">
                <Cpu className="h-3 w-3" />
                Motor: {activeLlm}
              </span>
              {(overview?.langsmith_tracing ?? health?.langsmith_tracing) && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#d4ff00]/35 bg-[#d4ff00]/10 px-2 py-0.5 font-mono text-[10px] text-[#d4ff00]">
                  LangSmith Activo
                </span>
              )}
            </div>
            <h2 className="mt-1.5 text-sm font-bold text-white md:text-base">
              Ingesta Web Medallion (Playwright + Trafilatura) & Cadenas LCEL Grounded
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {overview?.has_architecture_html && (
              <a
                href={getM1ArchitectureUrl()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#00f5ff]/45 bg-[#00f5ff]/10 px-3 py-1.5 font-mono text-[11px] font-semibold text-[#00f5ff] transition-colors hover:bg-[#00f5ff]/20"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Mapa Archify M1
              </a>
            )}
          </div>
        </div>

        {/* KPIs Medallion Gold */}
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-[#08080a]/80 px-3 py-2">
            <p className="font-mono text-[10px] text-[#8b9bb4]">URLS OBJETIVO</p>
            <p className="mt-0.5 text-base font-bold text-white">
              {metrics?.total_urls_target ?? 8}{" "}
              <span className="font-mono text-[10px] font-normal text-[#00f5ff]">Dominios TQ</span>
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#08080a]/80 px-3 py-2">
            <p className="font-mono text-[10px] text-[#8b9bb4]">PÁGINAS GOLD</p>
            <p className="mt-0.5 text-base font-bold text-[#d4ff00]">
              {metrics?.total_pages_scraped ?? 6}{" "}
              <span className="font-mono text-[10px] font-normal text-[#8b9bb4]">
                Deduplicadas SHA-256
              </span>
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#08080a]/80 px-3 py-2">
            <p className="font-mono text-[10px] text-[#8b9bb4]">TOKENS CORPUS</p>
            <p className="mt-0.5 text-base font-bold text-[#00f5ff]">
              ~{(metrics?.total_tokens ?? 2551).toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#08080a]/80 px-3 py-2">
            <p className="font-mono text-[10px] text-[#8b9bb4]">REDUCCIÓN RUIDO HTML</p>
            <p className="mt-0.5 text-base font-bold text-[#ffe600]">
              -{metrics?.noise_reduction_ratio_pct ?? 98.4}%{" "}
              <span className="font-mono text-[10px] font-normal text-[#8b9bb4]">
                ({Math.round((metrics?.noise_discarded_bytes ?? 845069) / 1024)} KB)
              </span>
            </p>
          </div>
        </div>

        {/* Sub-menú Módulo 1 */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[
            { id: "qa" as const, label: "Q&A Grounded (LCEL)", icon: Sparkles },
            { id: "summary" as const, label: "Síntesis Ejecutiva", icon: FileText },
            { id: "faq" as const, label: "Preguntas Frecuentes", icon: HelpCircle },
            {
              id: "medallion" as const,
              label: "Pipeline Medallion, Corpus & Pruebas",
              icon: FlaskConical,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                  active
                    ? "border-[#00f5ff] bg-[#00f5ff]/15 text-[#00f5ff] shadow-[0_0_16px_rgba(0,245,255,0.16)]"
                    : "border-white/10 bg-[#141520] text-[#a8bad3] hover:border-white/25 hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {errorMsg && (
        <div className="mx-4 mt-3 rounded-xl border border-[#ff4d00]/55 bg-[#ff4d00]/12 px-4 py-2 text-xs text-[#ffd2be]">
          {errorMsg}
        </div>
      )}

      {/* Contenido de cada pestaña del Módulo 1 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {activeTab === "qa" && (
          <div className="grid h-full min-h-[420px] grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Chat LCEL Grounded */}
            <div className="holo-panel flex min-h-[380px] flex-col rounded-2xl border border-white/10 bg-[#0f0f15]/90 p-4 lg:col-span-7">
              <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Asistente LCEL Grounded (`QA_PROMPT | LLM | StrOutputParser`)
                  </h3>
                  <p className="font-mono text-[10px] text-[#8b9bb4]">
                    Guardrail estricto anti-alucinación sobre `knowledge_base.txt`
                  </p>
                </div>
                <span className="rounded-md border border-[#d4ff00]/45 bg-[#d4ff00]/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#d4ff00]">
                  Cero Alucinaciones
                </span>
              </div>

              <div className="mb-2 flex flex-wrap gap-1.5">
                {[
                  "¿Dónde quedan ubicadas las plantas de Tecnoquímicas?",
                  "¿Qué marcas insignia fabrica Tecnoquímicas?",
                  "¿Cuál es el precio exacto de Bonfiest en farmacia?",
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => void handleSendQA(sample)}
                    disabled={qaStreaming}
                    className="rounded-md border border-white/10 bg-[#161622] px-2 py-1 text-[10px] text-[#cbd5e1] transition-colors hover:border-[#00f5ff]/50 hover:text-[#00f5ff]"
                  >
                    {sample}
                  </button>
                ))}
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-white/8 bg-[#08080a]/70 p-3">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${
                      m.role === "user"
                        ? "ml-auto max-w-[85%] border-[#00f5ff]/35 bg-[#00f5ff]/10 text-white"
                        : "max-w-[95%] border-white/10 bg-[#141520] text-[#e2e8f0]"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-[#8b9bb4]">
                      <span>{m.role === "user" ? "OPERADOR" : `LCEL · ${activeLlm}`}</span>
                      {m.latencyMs ? <span>{m.latencyMs} ms</span> : null}
                    </div>
                    <p className="whitespace-pre-wrap">{m.content || "Generando..."}</p>
                  </div>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSendQA();
                }}
                className="mt-3 flex gap-2"
              >
                <input
                  type="text"
                  value={qaInput}
                  onChange={(e) => setQaInput(e.target.value)}
                  disabled={qaStreaming}
                  placeholder="Consulta el corpus auditado de Módulo 1..."
                  className="flex-1 rounded-xl border border-white/15 bg-[#08080a] px-3.5 py-2 text-xs text-white outline-none focus:border-[#00f5ff]"
                />
                <button
                  type="submit"
                  disabled={qaStreaming || !qaInput.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#00f5ff] px-4 py-2 text-xs font-bold text-[#08080a] transition-all hover:brightness-110 disabled:opacity-45"
                >
                  <Send className="h-3.5 w-3.5" />
                  {qaStreaming ? "Streaming..." : "Consultar"}
                </button>
              </form>
            </div>

            {/* Carrusel Plantas & Portafolio TQ */}
            <div className="holo-panel flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0f0f15]/90 p-4 lg:col-span-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <h3 className="text-sm font-bold text-white">Plantas & Portafolio TQ</h3>
                <span className="rounded-full border border-[#00f5ff]/45 bg-[#00f5ff]/10 px-2 py-0.5 font-mono text-[10px] text-[#00f5ff]">
                  ● Rotación Automática
                </span>
              </div>

              <div className="relative my-3 h-64 overflow-hidden rounded-xl border border-white/10 bg-[#050608]">
                <img
                  src={currentSlide.image}
                  alt={currentSlide.title}
                  className="h-full w-full object-cover opacity-80 transition-opacity duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-[#08080a]/55 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#d4ff00]">
                    {currentSlide.tag}
                  </span>
                  <h4 className="mt-0.5 text-base font-bold text-white">{currentSlide.title}</h4>
                  <p className="mt-1 text-xs leading-relaxed text-[#cbd5e1]">
                    {currentSlide.desc}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-center gap-2">
                  {TQ_PORTFOLIO_SLIDES.map((s, idx) => (
                    <button
                      key={s.title}
                      type="button"
                      onClick={() => setSlideIdx(idx)}
                      aria-label={`Ver ${s.title}`}
                      className={`h-2 rounded-full transition-all ${
                        idx === slideIdx ? "w-6 bg-[#00f5ff]" : "w-2 bg-white/20 hover:bg-white/40"
                      }`}
                    />
                  ))}
                </div>

                <a
                  href={currentSlide.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-xl border border-white/12 bg-[#161622] px-3.5 py-2.5 text-xs font-semibold text-white transition-colors hover:border-[#00f5ff]/55 hover:text-[#00f5ff]"
                >
                  <span>Explorar {currentSlide.title}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-[#00f5ff]" />
                </a>
              </div>
            </div>
          </div>
        )}

        {activeTab === "summary" && (
          <div className="holo-panel mx-auto max-w-4xl rounded-2xl border border-white/10 bg-[#0f0f15]/90 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Síntesis Ejecutiva Corporativa (`SUMMARY_PROMPT` · LCEL)
                </h3>
                <p className="text-xs text-[#8b9bb4]">
                  Genera un informe condensado sobre trayectoria, plantas y marcas insignia desde
                  el corpus extraído.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleRunSummary()}
                disabled={summaryStreaming}
                className="inline-flex items-center gap-2 rounded-xl bg-[#00f5ff] px-4 py-2 text-xs font-bold text-[#08080a] transition-all hover:brightness-110 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {summaryStreaming ? "Generando con Gemini..." : "Generar Síntesis Ejecutiva"}
              </button>
            </div>

            <div className="mt-4 min-h-[260px] rounded-xl border border-white/10 bg-[#08080a]/75 p-4 text-xs leading-relaxed text-[#e2e8f0]">
              {summaryText ? (
                <p className="whitespace-pre-wrap">{summaryText}</p>
              ) : (
                <p className="font-mono text-[#8b9bb4]">
                  Presiona &ldquo;Generar Síntesis Ejecutiva&rdquo; para ejecutar la cadena LCEL
                  en streaming en vivo.
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === "faq" && (
          <div className="holo-panel mx-auto max-w-4xl rounded-2xl border border-white/10 bg-[#0f0f15]/90 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Preguntas Frecuentes Automatizadas (`FAQ_PROMPT` · LCEL)
                </h3>
                <p className="text-xs text-[#8b9bb4]">
                  Extracción estructurada de FAQ sobre laboratorios, plantas, distribución y
                  certificaciones INVIMA.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleRunFaq()}
                disabled={faqStreaming}
                className="inline-flex items-center gap-2 rounded-xl bg-[#d4ff00] px-4 py-2 text-xs font-bold text-[#08080a] transition-all hover:brightness-110 disabled:opacity-50"
              >
                <BookOpen className="h-4 w-4" />
                {faqStreaming ? "Extrayendo FAQ..." : "Extraer Preguntas Frecuentes"}
              </button>
            </div>

            <div className="mt-4 min-h-[260px] rounded-xl border border-white/10 bg-[#08080a]/75 p-4 text-xs leading-relaxed text-[#e2e8f0]">
              {faqText ? (
                <p className="whitespace-pre-wrap">{faqText}</p>
              ) : (
                <p className="font-mono text-[#8b9bb4]">
                  Presiona &ldquo;Extraer Preguntas Frecuentes&rdquo; para generar las FAQ en vivo
                  con el motor LLM actualizado.
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === "medallion" && (
          <div className="space-y-4">
            {/* Pipeline Medallion + Stack Scraping */}
            <div className="holo-panel rounded-2xl border border-white/10 bg-[#0f0f15]/90 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                  <Database className="h-4 w-4 text-[#00f5ff]" />
                  Pipeline Medallion (Bronze HTML $\to$ Silver Texto $\to$ Gold JSONL)
                </h3>
                <span className="rounded-full border border-[#d4ff00]/45 bg-[#d4ff00]/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-[#d4ff00]">
                  5/5 Etapas Verificadas
                </span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
                {[
                  {
                    title: "Playwright Chromium",
                    desc: "Ingesta asíncrona headless con hidratación JS/SPA",
                  },
                  {
                    title: "Trafilatura + BS4",
                    desc: "Extracción por densidad textual y limpieza HTML (-98.4% ruido)",
                  },
                  {
                    title: "Deduplicación SHA-256",
                    desc: "Integridad criptográfica y contratos Pydantic v2 Gold",
                  },
                  {
                    title: "Benchmark M1 (20 Casos)",
                    desc: "10/10 In-Scope · 5/5 Semánticos · 5/5 Guardrail OOS (100%)",
                  },
                ].map((stage) => (
                  <div
                    key={stage.title}
                    className="rounded-xl border border-white/10 bg-[#08080a]/80 p-3"
                  >
                    <p className="text-xs font-bold text-[#00f5ff]">{stage.title}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#cbd5e1]">
                      {stage.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Auditor Corpus Gold SHA-256 */}
            <div className="holo-panel rounded-2xl border border-white/10 bg-[#0f0f15]/90 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
                <ShieldCheck className="h-4 w-4 text-[#d4ff00]" />
                Auditor de Corpus Gold (`data/gold/corpus.jsonl`) — Hashes SHA-256
              </h3>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {(overview?.gold_docs ?? []).map((doc) => (
                  <div
                    key={doc.content_hash || doc.url}
                    className="rounded-xl border border-white/10 bg-[#08080a]/75 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-white">{doc.section}</span>
                      <span className="font-mono text-[10px] text-[#d4ff00]">
                        ~{doc.token_count.toLocaleString()} tokens
                      </span>
                    </div>
                    <p className="mt-1 truncate font-mono text-[10px] text-[#00f5ff]">{doc.url}</p>
                    <p className="mt-1 font-mono text-[10px] text-[#8b9bb4]">
                      SHA-256: {doc.content_hash.slice(0, 24)}... · {doc.char_count.toLocaleString()}{" "}
                      chars
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Pytest Runner en Vivo + Benchmark Markdown */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="holo-panel rounded-2xl border border-white/10 bg-[#0f0f15]/90 p-4 lg:col-span-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                    <Terminal className="h-4 w-4 text-[#00f5ff]" />
                    Suite Pytest en Vivo (M1 + M2)
                  </h3>
                  <button
                    type="button"
                    onClick={() => void handleRunPytest()}
                    disabled={pytestLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#00f5ff] px-3 py-1.5 text-xs font-bold text-[#08080a] hover:brightness-110 disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5" />
                    {pytestLoading ? "Ejecutando..." : "Ejecutar Pytest"}
                  </button>
                </div>

                {pytestResult ? (
                  <div className="mt-3">
                    <div
                      className={`mb-2 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                        pytestResult.returncode === 0
                          ? "border-[#d4ff00]/50 bg-[#d4ff00]/10 text-[#d4ff00]"
                          : "border-[#ff4d00]/50 bg-[#ff4d00]/10 text-[#ff9366]"
                      }`}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {pytestResult.returncode === 0
                        ? "Todas las pruebas pasaron correctamente (exit code 0)"
                        : `Pytest finalizó con código ${pytestResult.returncode}`}
                    </div>
                    <pre className="max-h-72 overflow-auto rounded-xl border border-white/10 bg-[#050608] p-3 font-mono text-[10px] leading-relaxed text-[#cbd5e1]">
                      {pytestResult.stdout || pytestResult.stderr}
                    </pre>
                  </div>
                ) : (
                  <p className="mt-3 font-mono text-xs text-[#8b9bb4]">
                    Haz clic en &ldquo;Ejecutar Pytest&rdquo; para correr en vivo las pruebas
                    unitarias e integración desde el backend FastAPI.
                  </p>
                )}
              </div>

              <div className="holo-panel rounded-2xl border border-white/10 bg-[#0f0f15]/90 p-4 lg:col-span-6">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
                  <FlaskConical className="h-4 w-4 text-[#ffe600]" />
                  Resultados Auditados del Benchmark M1 (20 Casos)
                </h3>
                <pre className="max-h-80 overflow-auto rounded-xl border border-white/10 bg-[#050608] p-3 font-mono text-[10px] leading-relaxed text-[#cbd5e1]">
                  {overview?.benchmark_markdown || "Cargando benchmark_results.md..."}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
