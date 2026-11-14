import { useState } from "react";
import { AlertTriangle, CheckCircle2, Pencil, XCircle } from "lucide-react";
import type { HITLInterruptPayload } from "../types/agent";

interface HITLBannerProps {
  interrupt: HITLInterruptPayload;
  isSubmitting: boolean;
  onResolve: (decision: "approve" | "edit" | "reject", editedArgs?: Record<string, unknown>) => void;
}

export function HITLBanner({ interrupt, isSubmitting, onResolve }: HITLBannerProps) {
  const [editing, setEditing] = useState(false);
  const [anio, setAnio] = useState(interrupt.proposed_args?.anio ?? 2025);
  const [trimestre, setTrimestre] = useState(interrupt.proposed_args?.trimestre ?? "Q3");
  const [formato, setFormato] = useState(interrupt.proposed_args?.formato ?? "JSON_AUDITORIA");
  const [destinatario, setDestinatario] = useState(
    interrupt.proposed_args?.destinatario ?? "Comité de Auditoría y Calidad TQ",
  );

  return (
    <div className="holo-card-3d relative my-3 overflow-hidden rounded-2xl border-2 border-[#ffe600]/80 bg-[#161622]/95 p-4 shadow-[0_0_35px_rgba(255,230,0,0.16)]">
      {/* Escáner de advertencia táctica */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] overflow-hidden">
        <div className="animate-hazard-scan h-full w-1/3 bg-gradient-to-r from-[#ff4d00] via-[#ffe600] to-[#ff4d00]" />
      </div>

      <div className="flex items-start gap-3">
        <div className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#ffe600]/60 bg-[#ffe600]/15 text-[#ffe600]">
          <span className="animate-pulse-ring absolute inset-0 rounded-xl border border-[#ffe600]" />
          <AlertTriangle className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-[#ffe600]">
              Pausa HITL en vivo: aprobación humana requerida
            </h4>
            <span className="rounded border border-[#ff4d00]/60 bg-[#ff4d00]/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#ff9366]">
              {interrupt.tool}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[#cbd5e1]">{interrupt.message}</p>

          {!editing ? (
            <pre className="mt-3 overflow-x-auto rounded-xl border border-white/12 bg-[#08080a] p-3 font-mono text-[11px] text-[#00f5ff]">
              {JSON.stringify(interrupt.proposed_args, null, 2)}
            </pre>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-white/12 bg-[#08080a] p-3.5 sm:grid-cols-2">
              <label className="text-xs text-[#cbd5e1]">
                <span className="mb-1 block font-mono text-[11px] font-medium text-[#8b9bb4]">
                  Año fiscal
                </span>
                <select
                  value={anio}
                  onChange={(e) => setAnio(Number(e.target.value))}
                  className="w-full rounded-lg border border-white/15 bg-[#161622] px-2.5 py-2 text-xs text-[#eef4fc] outline-none focus:border-[#00f5ff]"
                >
                  <option value={2024}>2024</option>
                  <option value={2025}>2025</option>
                  <option value={2026}>2026</option>
                </select>
              </label>

              <label className="text-xs text-[#cbd5e1]">
                <span className="mb-1 block font-mono text-[11px] font-medium text-[#8b9bb4]">
                  Trimestre
                </span>
                <select
                  value={trimestre}
                  onChange={(e) => setTrimestre(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#161622] px-2.5 py-2 text-xs text-[#eef4fc] outline-none focus:border-[#00f5ff]"
                >
                  <option value="Q1">Q1</option>
                  <option value="Q2">Q2</option>
                  <option value="Q3">Q3</option>
                  <option value="Q4">Q4</option>
                </select>
              </label>

              <label className="text-xs text-[#cbd5e1]">
                <span className="mb-1 block font-mono text-[11px] font-medium text-[#8b9bb4]">
                  Formato oficial
                </span>
                <select
                  value={formato}
                  onChange={(e) => setFormato(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#161622] px-2.5 py-2 text-xs text-[#eef4fc] outline-none focus:border-[#00f5ff]"
                >
                  <option value="JSON_AUDITORIA">JSON_AUDITORIA</option>
                  <option value="CSV_FIRMADO">CSV_FIRMADO</option>
                  <option value="PDF_EJECUTIVO">PDF_EJECUTIVO</option>
                </select>
              </label>

              <label className="text-xs text-[#cbd5e1]">
                <span className="mb-1 block font-mono text-[11px] font-medium text-[#8b9bb4]">
                  Destinatario
                </span>
                <input
                  type="text"
                  value={destinatario}
                  onChange={(e) => setDestinatario(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#161622] px-2.5 py-2 text-xs text-[#eef4fc] outline-none focus:border-[#00f5ff]"
                />
              </label>
            </div>
          )}

          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            {!editing ? (
              <>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => onResolve("approve")}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#d4ff00] px-3.5 py-2 text-xs font-bold text-[#08080a] transition-all hover:brightness-110 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Aprobar ejecución
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setEditing(true)}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#ffe600]/65 bg-[#ffe600]/12 px-3.5 py-2 text-xs font-semibold text-[#ffe600] transition-colors hover:bg-[#ffe600]/20 disabled:opacity-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar parámetros
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() =>
                  onResolve("edit", { anio, trimestre, formato, destinatario })
                }
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#00f5ff] px-3.5 py-2 text-xs font-bold text-[#08080a] transition-all hover:brightness-110 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Guardar edición y aprobar
              </button>
            )}

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => onResolve("reject")}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#ff4d00]/65 bg-[#ff4d00]/12 px-3.5 py-2 text-xs font-semibold text-[#ff9366] transition-colors hover:bg-[#ff4d00]/22 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              Rechazar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
