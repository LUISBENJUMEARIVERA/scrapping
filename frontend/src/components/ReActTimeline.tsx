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
  DIRECT_GREETING: "bg-slate-100 text-slate-700 border-slate-300",
  MEMORY_ONLY: "bg-indigo-50 text-indigo-700 border-indigo-200",
  STRUCTURED_CSV: "bg-teal-50 text-teal-700 border-teal-200",
  RAG_DOCUMENTAL: "bg-blue-50 text-blue-700 border-blue-200",
  MIXED_HYBRID: "bg-violet-50 text-violet-700 border-violet-200",
  HITL_ACTION: "bg-amber-50 text-amber-800 border-amber-300",
  OUT_OF_SCOPE: "bg-rose-50 text-rose-700 border-rose-200",
};

function StepIcon({ type }: { type: ReActStep["type"] }) {
  switch (type) {
    case "memory":
      return <Database className="h-3.5 w-3.5 text-indigo-600" />;
    case "router":
      return <GitBranch className="h-3.5 w-3.5 text-blue-600" />;
    case "thought":
      return <Brain className="h-3.5 w-3.5 text-amber-600" />;
    case "action":
      return <Wrench className="h-3.5 w-3.5 text-teal-600" />;
    case "observation":
      return <Eye className="h-3.5 w-3.5 text-emerald-600" />;
  }
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

  const badgeClass =
    ROUTE_COLORS[routerDecision?.choice ?? "RAG_DOCUMENTAL"] ??
    "bg-slate-100 text-slate-700 border-slate-300";

  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/80 text-xs">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-100/70 transition-colors rounded-lg"
      >
        <div className="flex flex-wrap items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
          )}
          <span className="font-medium text-slate-700 flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-[#0052CC]" />
            Ciclo ReAct ({steps.length} pasos)
          </span>

          {routerDecision && (
            <span className={`rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${badgeClass}`}>
              Jev: {routerDecision.choice} ({Math.round(routerDecision.score * 100)}%)
            </span>
          )}

          {shieldTriggered ? (
            <span className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-2 py-0.5 font-medium text-rose-700">
              <ShieldAlert className="h-3 w-3" />
              Inyección Bloqueada
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded border border-teal-200 bg-teal-50 px-2 py-0.5 font-medium text-teal-700">
              <ShieldCheck className="h-3 w-3" />
              Contexto Seguro
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500">
          {isStreaming && (
            <span className="inline-flex items-center gap-1 text-[#0052CC]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0052CC] animate-pulse" />
              ejecutando
            </span>
          )}
          {latencyMs !== undefined && <span>{latencyMs} ms</span>}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 px-3 py-2.5 space-y-2">
          {routerDecision && routerDecision.noul.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pb-1">
              <span className="text-[11px] text-slate-500 font-medium">Noul (Entidades):</span>
              {routerDecision.noul.map((ent) => (
                <span
                  key={ent}
                  className="rounded bg-white border border-slate-200 px-1.5 py-0.5 font-mono text-[11px] text-slate-700"
                >
                  {ent}
                </span>
              ))}
            </div>
          )}

          {steps.map((step, idx) => (
            <div
              key={`${step.type}-${idx}`}
              className="rounded border border-slate-200 bg-white p-2.5"
            >
              <div className="flex items-center gap-2 font-medium text-slate-800 mb-1">
                <StepIcon type={step.type} />
                <span>{step.title}</span>
              </div>
              <pre className="overflow-x-auto rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-600 leading-relaxed">
                {JSON.stringify(step.detail, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
