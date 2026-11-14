import { useState } from "react";
import {
  BarChart3,
  Database,
  GitFork,
  History,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import type {
  CheckpointInfo,
  EvalMetricsResponse,
  HealthStatus,
  LongTermStoreProfile,
} from "../types/agent";

interface InspectorPanelProps {
  userId: string;
  threadId: string;
  storeProfile: LongTermStoreProfile | null;
  checkpoints: CheckpointInfo[];
  health: HealthStatus | null;
  evalMetrics: EvalMetricsResponse | null;
  onForkCheckpoint: (checkpointId: string) => void;
  onToggleTrap: (enabled: boolean) => void;
}

export function InspectorPanel({
  userId,
  threadId,
  storeProfile,
  checkpoints,
  health,
  evalMetrics,
  onForkCheckpoint,
  onToggleTrap,
}: InspectorPanelProps) {
  const [activeTab, setActiveTab] = useState<"memory" | "rag" | "eval">("memory");
  const trapEnabled = health?.qdrant_stats?.trap_enabled ?? false;

  return (
    <aside className="flex h-full flex-col border-l border-white/10 bg-[#0f0f15]/90 backdrop-blur-xl">
      <div className="border-b border-white/10 px-3 pt-3">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="font-mono text-xs font-semibold tracking-wider text-[#eef4fc]">
            CABINA DE TELEMETRÍA
          </h2>
          <span className="rounded border border-[#00f5ff]/35 bg-[#00f5ff]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#00f5ff]">
            v2.0 3D
          </span>
        </div>

        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("memory")}
            className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-xs font-medium transition-colors ${
              activeTab === "memory"
                ? "border-[#00f5ff] text-[#00f5ff]"
                : "border-transparent text-[#8b9bb4] hover:text-[#eef4fc]"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            Memoria
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("rag")}
            className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-xs font-medium transition-colors ${
              activeTab === "rag"
                ? "border-[#00f5ff] text-[#00f5ff]"
                : "border-transparent text-[#8b9bb4] hover:text-[#eef4fc]"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Qdrant Shield
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("eval")}
            className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-xs font-medium transition-colors ${
              activeTab === "eval"
                ? "border-[#00f5ff] text-[#00f5ff]"
                : "border-transparent text-[#8b9bb4] hover:text-[#eef4fc]"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Benchmark
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {activeTab === "memory" && (
          <>
            <section className="holo-card-3d rounded-xl border border-white/10 bg-[#161622]/85 p-3">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[#eef4fc]">
                  <UserCheck className="h-3.5 w-3.5 text-[#00f5ff]" />
                  Store Largo Plazo
                </h3>
                <span className="truncate rounded border border-[#00f5ff]/30 bg-[#00f5ff]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#00f5ff]">
                  users/{userId}/profile
                </span>
              </div>

              {storeProfile && storeProfile.items.length > 0 ? (
                <div className="space-y-1.5">
                  {storeProfile.items.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#08080a] px-2.5 py-2 text-xs transition-colors hover:border-[#00f5ff]/35"
                    >
                      <span className="font-mono text-[11px] text-[#8b9bb4]">{item.key}</span>
                      <span className="truncate font-semibold text-[#d4ff00]">
                        {item.value.fact}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-[#8b9bb4]">
                  Sin hechos persistidos para <span className="font-mono text-[#00f5ff]">{userId}</span>.
                  Ejecuta el caso 2A para almacenar perfil entre hilos.
                </p>
              )}
            </section>

            <section className="holo-card-3d rounded-xl border border-white/10 bg-[#161622]/85 p-3">
              <div className="mb-2.5 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[#eef4fc]">
                  <Database className="h-3.5 w-3.5 text-[#d4ff00]" />
                  Checkpoints (SqliteSaver)
                </h3>
                <span className="font-mono text-[10px] text-[#8b9bb4]">
                  {threadId.slice(0, 12)}
                </span>
              </div>

              {checkpoints.length > 0 ? (
                <div className="relative space-y-2.5 pl-3 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-[1px] before:bg-[#00f5ff]/30">
                  {checkpoints.slice(0, 8).map((cp) => (
                    <div
                      key={cp.checkpoint_id}
                      className="relative rounded-lg border border-white/10 bg-[#08080a] p-2.5 text-xs transition-all hover:border-[#00f5ff]/45"
                    >
                      <span className="absolute -left-[11px] top-3.5 h-2 w-2 rounded-full border border-[#08080a] bg-[#00f5ff] shadow-[0_0_8px_#00f5ff]" />
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-[#00f5ff]">
                          #{cp.index + 1} · {cp.checkpoint_id.slice(0, 10)}
                        </span>
                        <button
                          type="button"
                          onClick={() => onForkCheckpoint(cp.checkpoint_id)}
                          title="Time-Travel: bifurcar hilo desde este checkpoint"
                          className="inline-flex items-center gap-1 rounded border border-[#00f5ff]/35 bg-[#00f5ff]/10 px-2 py-0.5 font-mono text-[10px] font-medium text-[#00f5ff] transition-colors hover:bg-[#00f5ff]/25"
                        >
                          <GitFork className="h-3 w-3" />
                          Fork
                        </button>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-[#8b9bb4]">
                        {cp.message_count} mensajes · {cp.preview || "Estado inicial"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-[#8b9bb4]">
                  Envía una consulta para registrar nodos de estado durables con soporte Time-Travel.
                </p>
              )}
            </section>
          </>
        )}

        {activeTab === "rag" && (
          <>
            <section className="holo-card-3d space-y-2.5 rounded-xl border border-white/10 bg-[#161622]/85 p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[#eef4fc]">
                  Bóveda Vectorial Qdrant
                </h3>
                <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#d4ff00]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#d4ff00] animate-pulse" />
                  RRF HÍBRIDO
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#8b9bb4]">Colección</span>
                  <span className="font-mono font-medium text-[#eef4fc]">
                    {health?.qdrant_stats?.collection_name ?? "tq_knowledge_m2"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8b9bb4]">Vectores indexados</span>
                  <span className="font-mono font-semibold text-[#00f5ff]">
                    {health?.qdrant_stats?.points_count ?? 0} puntos
                  </span>
                </div>
                <div className="rounded-lg border border-white/10 bg-[#08080a] p-2 font-mono text-[11px] text-[#a8bad3]">
                  {health?.qdrant_stats?.index_type ?? "HNSW + Sparse BM25 + RRF"}
                </div>
              </div>
            </section>

            <section
              className={`holo-card-3d relative overflow-hidden rounded-xl border p-3.5 ${
                trapEnabled
                  ? "border-[#ff4d00]/80 bg-[#ff4d00]/10 shadow-[0_0_24px_rgba(255,77,0,0.18)]"
                  : "border-white/10 bg-[#161622]/85"
              }`}
            >
              {trapEnabled && (
                <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] overflow-hidden">
                  <div className="animate-hazard-scan h-full w-1/2 bg-[#ff4d00]" />
                </div>
              )}

              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[#eef4fc]">
                    {trapEnabled ? (
                      <ShieldAlert className="h-4 w-4 text-[#ff4d00]" />
                    ) : (
                      <ShieldCheck className="h-4 w-4 text-[#d4ff00]" />
                    )}
                    Trampa Prompt Injection (Caso 5)
                  </h3>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[#a8bad3]">
                    Inyecta en Qdrant un documento malicioso que ordena ignorar reglas y afirmar que TQ
                    regala medicamentos sin fórmula para comprobar el blindaje pasivo.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onToggleTrap(!trapEnabled)}
                className={`mt-3 min-h-[38px] w-full rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                  trapEnabled
                    ? "bg-[#ff4d00] text-[#08080a] hover:brightness-110"
                    : "border border-[#00f5ff]/45 bg-[#00f5ff]/15 text-[#00f5ff] hover:bg-[#00f5ff]/25"
                }`}
              >
                {trapEnabled ? "Desactivar documento trampa" : "Activar documento trampa en Qdrant"}
              </button>
            </section>
          </>
        )}

        {activeTab === "eval" && evalMetrics && (
          <>
            <section className="holo-card-3d space-y-2.5 rounded-xl border border-white/10 bg-[#161622]/85 p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[#eef4fc]">
                  Benchmark ({evalMetrics.evaluation.dataset_size} consultas)
                </h3>
                <span className="rounded border border-[#d4ff00]/45 bg-[#d4ff00]/12 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#d4ff00]">
                  Router: {Math.round(evalMetrics.evaluation.router_evaluation.accuracy * 100)}%
                </span>
              </div>

              <div className="space-y-2">
                {Object.values(evalMetrics.evaluation.comparison).map((row) => {
                  const pct10 = Math.max(0, Math.min(100, row.recall_at_10 * 100));
                  const isHybrid = row.mode.toLowerCase().includes("hybrid");
                  return (
                    <div
                      key={row.mode}
                      className="rounded-lg border border-white/10 bg-[#08080a] p-2.5 text-xs"
                    >
                      <div className="mb-1.5 flex items-center justify-between font-medium">
                        <span className="font-mono uppercase text-[#eef4fc]">{row.mode}</span>
                        <span
                          className={`font-mono font-semibold ${
                            isHybrid ? "text-[#d4ff00]" : "text-[#00f5ff]"
                          }`}
                        >
                          R@10: {pct10.toFixed(0)}%
                        </span>
                      </div>

                      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          style={{ width: `${pct10}%` }}
                          className={`h-full rounded-full transition-all duration-700 ${
                            isHybrid
                              ? "bg-[#d4ff00] shadow-[0_0_10px_rgba(212,255,0,0.6)]"
                              : "bg-[#00f5ff]"
                          }`}
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-1 font-mono text-[10px] text-[#8b9bb4]">
                        <div>R@5: {row.recall_at_5.toFixed(2)}</div>
                        <div>MRR: {row.mrr.toFixed(3)}</div>
                        <div>nDCG: {row.ndcg_at_10.toFixed(3)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="holo-card-3d rounded-xl border border-white/10 bg-[#161622]/85 p-3">
              <h3 className="mb-2 text-xs font-semibold text-[#eef4fc]">
                Dataset Determinista CSV (Q3 2025)
              </h3>
              <div className="space-y-1.5">
                {evalMetrics.sales_2025_preview
                  .filter((r) => r.trimestre === "Q3")
                  .map((r) => (
                    <div
                      key={`${r.trimestre}-${r.division}`}
                      className="rounded-lg border border-white/10 bg-[#08080a] px-2.5 py-2 text-[11px]"
                    >
                      <div className="flex justify-between font-medium text-[#eef4fc]">
                        <span>{r.division}</span>
                        <span className="font-mono text-[#d4ff00]">{r.cumplimiento_pct}%</span>
                      </div>
                      <div className="mt-0.5 flex justify-between font-mono text-[#8b9bb4]">
                        <span>{r.unidades_vendidas.toLocaleString("es-CO")} uds</span>
                        <span>${r.ingresos_cop_millones.toLocaleString("es-CO")}M COP</span>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
