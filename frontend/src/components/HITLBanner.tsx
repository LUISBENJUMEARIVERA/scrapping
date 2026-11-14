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
    <div className="my-3 rounded-xl border-2 border-amber-400 bg-amber-50/90 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-amber-100 p-2 text-amber-700">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-amber-950">
              Pausa HITL en vivo: aprobación humana requerida
            </h4>
            <span className="rounded bg-amber-200/70 px-2 py-0.5 font-mono text-[11px] font-medium text-amber-900">
              {interrupt.tool}
            </span>
          </div>
          <p className="mt-1 text-xs text-amber-900/90 leading-relaxed">{interrupt.message}</p>

          {!editing ? (
            <pre className="mt-2.5 overflow-x-auto rounded-lg border border-amber-200 bg-white p-2.5 font-mono text-[11px] text-slate-700">
              {JSON.stringify(interrupt.proposed_args, null, 2)}
            </pre>
          ) : (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-lg border border-amber-200 bg-white p-3">
              <label className="text-xs text-slate-700">
                <span className="block font-medium mb-1">Año fiscal</span>
                <select
                  value={anio}
                  onChange={(e) => setAnio(Number(e.target.value))}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                >
                  <option value={2024}>2024</option>
                  <option value={2025}>2025</option>
                  <option value={2026}>2026</option>
                </select>
              </label>

              <label className="text-xs text-slate-700">
                <span className="block font-medium mb-1">Trimestre</span>
                <select
                  value={trimestre}
                  onChange={(e) => setTrimestre(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                >
                  <option value="Q1">Q1</option>
                  <option value="Q2">Q2</option>
                  <option value="Q3">Q3</option>
                  <option value="Q4">Q4</option>
                </select>
              </label>

              <label className="text-xs text-slate-700">
                <span className="block font-medium mb-1">Formato oficial</span>
                <select
                  value={formato}
                  onChange={(e) => setFormato(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                >
                  <option value="JSON_AUDITORIA">JSON_AUDITORIA</option>
                  <option value="CSV_FIRMADO">CSV_FIRMADO</option>
                  <option value="PDF_EJECUTIVO">PDF_EJECUTIVO</option>
                </select>
              </label>

              <label className="text-xs text-slate-700">
                <span className="block font-medium mb-1">Destinatario</span>
                <input
                  type="text"
                  value={destinatario}
                  onChange={(e) => setDestinatario(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                />
              </label>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!editing ? (
              <>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => onResolve("approve")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D9488] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0F766E] disabled:opacity-50 transition-colors"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Aprobar ejecución
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 transition-colors"
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
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0052CC] px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Guardar edición y aprobar
              </button>
            )}

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => onResolve("reject")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 transition-colors"
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
