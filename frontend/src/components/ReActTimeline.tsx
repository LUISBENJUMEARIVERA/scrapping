import { useState } from "react";
import {
  Brain,
  ChevronDown,
  ChevronRight,
  Cpu,
  Database,
  Eye,
  GitBranch,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type { ReActStep, RouterDecision } from "../types/agent";

interface ReActTimelineProps {
  routerDecision?: RouterDecision;
  steps: ReActStep[];
  shieldTriggered: boolean;
  isStreaming?: boolean;
  latencyMs?: number;
}

const ROUTE_COLORS: Record<string, string> = {
  DIRECT_GREETING: "border-white/20 bg-[#161622] text-[#cbd5e1]",
  MEMORY_ONLY: "border-[#00f5ff]/45 bg-[#00f5ff]/10 text-[#00f5ff]",
  STRUCTURED_CSV: "border-[#00f5ff]/55 bg-[#00f5ff]/15 text-[#7ef9ff]",
  RAG_DOCUMENTAL: "border-[#d4ff00]/45 bg-[#d4ff00]/10 text-[#d4ff00]",
  MIXED_HYBRID: "border-[#ffe600]/50 bg-[#ffe600]/10 text-[#ffe600]",
  HITL_ACTION: "border-[#ff4d00]/60 bg-[#ff4d00]/15 text-[#ff8652]",
  OUT_OF_SCOPE: "border-[#ff4d00]/50 bg-[#ff4d00]/12 text-[#ff7043]",
};

interface StationSpec {
  id: string;
  code: string;
  label: string;
  matchTypes: Array<ReActStep["type"]>;
}

const STATIONS: StationSpec[] = [
  { id: "mem", code: "01", label: "MEMORIA", matchTypes: ["memory"] },
  { id: "jev", code: "02", label: "ROUTER JEV", matchTypes: ["router"] },
  { id: "act", code: "03", label: "ACT TOOL", matchTypes: ["thought", "action"] },
  { id: "obs", code: "04", label: "OBSERVE", matchTypes: ["observation"] },
  { id: "syn", code: "05", label: "SYNTHESIS", matchTypes: [] },
];

function StepIcon({ type }: { type: ReActStep["type"] }) {
  switch (type) {
    case "memory":
      return <Database className="h-3.5 w-3.5 text-[#00f5ff]" />;
    case "router":
      return <GitBranch className="h-3.5 w-3.5 text-[#d4ff00]" />;
    case "thought":
      return <Brain className="h-3.5 w-3.5 text-[#ffe600]" />;
    case "action":
      return <Wrench className="h-3.5 w-3.5 text-[#00f5ff]" />;
    case "observation":
      return <Eye className="h-3.5 w-3.5 text-[#d4ff00]" />;
  }
}

function StepTiltCard({
  step,
  index,
}: {
  step: ReActStep;
  index: number;
}) {
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
    const py = (e.clientY - rect.top) / Math.max(1, rect.height) - 0.5;
    setTilt({ rx: -py * 5, ry: px * 5 });
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTilt({ rx: 0, ry: 0 })}
      style={{
        animationDelay: `${index * 65}ms`,
        transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateZ(${
          tilt.rx !== 0 || tilt.ry !== 0 ? 8 : 0
        }px)`,
      }}
      className="animate-step-3d rounded-xl border border-white/10 bg-[#08080a]/90 p-3 transition-transform duration-150 hover:border-[#00f5ff]/45"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 font-medium text-[#eef4fc]">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md border border-white/12 bg-[#161622]">
            <StepIcon type={step.type} />
          </span>
          <span className="text-xs font-semibold">{step.title}</span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#8b9bb4]">
          {step.type}
        </span>
      </div>
      <pre className="overflow-x-auto rounded-lg border border-white/8 bg-[#0f0f15] p-2.5 font-mono text-[11px] leading-relaxed text-[#a8bad3]">
        {JSON.stringify(step.detail, null, 2)}
      </pre>
    </div>
  );
}

export function ReActTimeline({
  routerDecision,
  steps,
  shieldTriggered,
  isStreaming,
  latencyMs,
}: ReActTimelineProps) {
  const [expanded, setExpanded] = useState(Boolean(isStreaming));

  if (steps.length === 0 && !routerDecision) return null;

  const presentTypes = new Set(steps.map((s) => s.type));
  const lastStepType = steps[steps.length - 1]?.type;
  const badgeClass =
    ROUTE_COLORS[routerDecision?.choice ?? "RAG_DOCUMENTAL"] ??
    "border-white/20 bg-[#161622] text-[#cbd5e1]";

  const isStationActive = (station: StationSpec) => {
    if (station.id === "syn") {
      return !isStreaming && steps.length > 0;
    }
    return station.matchTypes.some((t) => presentTypes.has(t));
  };

  const isStationRunning = (station: StationSpec) => {
    if (!isStreaming) return false;
    if (station.id === "syn") {
      return presentTypes.has("observation") || presentTypes.has("router");
    }
    return Boolean(lastStepType && station.matchTypes.includes(lastStepType));
  };

  return (
    <div className="mb-3 rounded-xl border border-white/12 bg-[#0f0f15]/85 text-xs">
      {/* Pipeline Espacial de 5 Estaciones ReAct */}
      <div className="border-b border-white/8 px-3 py-2.5">
        <div className="grid grid-cols-5 items-center gap-1.5">
          {STATIONS.map((station, idx) => {
            const done = isStationActive(station);
            const current = isStationRunning(station);
            return (
              <div key={station.id} className="relative flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`relative flex h-5 min-w-5 items-center justify-center rounded font-mono text-[9px] font-bold transition-all ${
                      current
                        ? "border border-[#00f5ff] bg-[#00f5ff]/25 text-[#00f5ff] shadow-[0_0_12px_rgba(0,245,255,0.45)]"
                        : done
                          ? "border border-[#d4ff00]/50 bg-[#d4ff00]/15 text-[#d4ff00]"
                          : "border border-white/10 bg-[#161622] text-[#8b9bb4]"
                    }`}
                  >
                    {current && (
                      <span className="animate-pulse-ring absolute inset-0 rounded border border-[#00f5ff]" />
                    )}
                    {station.code}
                  </span>
                  {idx < STATIONS.length - 1 && (
                    <div className="h-[2px] flex-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full transition-all duration-300 ${
                          current
                            ? "animate-data-stream w-full bg-gradient-to-r from-[#00f5ff] via-[#d4ff00] to-[#00f5ff]"
                            : done
                              ? "w-full bg-[#d4ff00]/75"
                              : "w-0"
                        }`}
                      />
                    </div>
                  )}
                </div>
                <span
                  className={`truncate font-mono text-[9px] font-medium ${
                    current ? "text-[#00f5ff]" : done ? "text-[#eef4fc]" : "text-[#8b9bb4]"
                  }`}
                >
                  {station.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cabecera colapsable de telemetría ReAct */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-b-xl px-3 py-2 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00f5ff]"
      >
        <div className="flex flex-wrap items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-[#00f5ff]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[#8b9bb4]" />
          )}
          <span className="flex items-center gap-1.5 font-medium text-[#eef4fc]">
            <Cpu className="h-3.5 w-3.5 text-[#00f5ff]" />
            Traza ReAct ({steps.length} pasos)
          </span>

          {routerDecision && (
            <span className={`rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${badgeClass}`}>
              Jev: {routerDecision.choice} ({Math.round(routerDecision.score * 100)}%)
            </span>
          )}

          {shieldTriggered ? (
            <span className="inline-flex items-center gap-1 rounded border border-[#ff4d00]/65 bg-[#ff4d00]/15 px-2 py-0.5 font-medium text-[#ff9366]">
              <ShieldAlert className="h-3 w-3" />
              Inyección Bloqueada
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded border border-[#d4ff00]/35 bg-[#d4ff00]/10 px-2 py-0.5 font-medium text-[#d4ff00]">
              <ShieldCheck className="h-3 w-3" />
              Contexto Seguro
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px] text-[#8b9bb4]">
          {isStreaming && (
            <span className="inline-flex items-center gap-1.5 text-[#00f5ff]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00f5ff] animate-pulse" />
              streaming SSE
            </span>
          )}
          {latencyMs !== undefined && <span className="text-[#eef4fc]">{latencyMs} ms</span>}
        </div>
      </button>

      {expanded && (
        <div className="space-y-2.5 border-t border-white/10 px-3 py-3">
          {routerDecision && routerDecision.noul.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pb-1">
              <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-[#8b9bb4]">
                Noul (Entidades):
              </span>
              {routerDecision.noul.map((ent) => (
                <span
                  key={ent}
                  className="rounded border border-[#00f5ff]/30 bg-[#161622] px-2 py-0.5 font-mono text-[11px] text-[#00f5ff]"
                >
                  {ent}
                </span>
              ))}
            </div>
          )}

          {steps.map((step, idx) => (
            <StepTiltCard key={`${step.type}-${idx}`} step={step} index={idx} />
          ))}
        </div>
      )}
    </div>
  );
}
