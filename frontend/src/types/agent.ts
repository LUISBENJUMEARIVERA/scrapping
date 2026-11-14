export type RouteChoice =
  | "DIRECT_GREETING"
  | "MEMORY_ONLY"
  | "STRUCTURED_CSV"
  | "RAG_DOCUMENTAL"
  | "MIXED_HYBRID"
  | "HITL_ACTION"
  | "OUT_OF_SCOPE";

export interface RouterDecision {
  choice: RouteChoice;
  noul: string[];
  score: number;
  box: Record<string, unknown>;
  reasoning: string;
}

export interface ReActStep {
  type: "memory" | "router" | "thought" | "action" | "observation";
  title: string;
  detail: Record<string, unknown>;
}

export interface CitationItem {
  chunk_id: string;
  title: string;
  section: string;
  url: string;
  score: number;
  citation: string;
  is_injection_trap?: boolean;
  snippet?: string;
}

export interface HITLInterruptPayload {
  type: string;
  tool: string;
  message: string;
  proposed_args: {
    anio: number;
    trimestre: string;
    formato: string;
    destinatario: string;
  };
  options: string[];
}

export interface ChatTurn {
  id: string;
  userQuery: string;
  assistantAnswer: string;
  routerDecision?: RouterDecision;
  steps: ReActStep[];
  citations: CitationItem[];
  shieldTriggered: boolean;
  blockedAlerts: Array<Record<string, unknown>>;
  checkpointId?: string | null;
  latencyMs?: number;
  isStreaming?: boolean;
}

export interface ThreadSummary {
  thread_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_choice: string;
  parent_thread_id?: string | null;
  forked_from_checkpoint?: string | null;
  turns: number;
}

export interface CheckpointInfo {
  index: number;
  checkpoint_id: string;
  parent_checkpoint_id?: string | null;
  step?: number | null;
  source?: string | null;
  message_count: number;
  preview: string;
  ts?: string | null;
}

export interface LongTermStoreProfile {
  namespace: string[];
  items: Array<{
    key: string;
    value: {
      fact: string;
      updated_at: string;
      source_text: string;
    };
  }>;
  summary: Record<string, string>;
}

export interface HealthStatus {
  status: string;
  company: string;
  llm_model: string;
  ollama_available: boolean;
  langsmith_tracing: boolean;
  qdrant_stats: {
    collection_name: string;
    points_count: number;
    storage_mode: string;
    trap_enabled: boolean;
    index_type: string;
  };
  threads_count: number;
}

export interface EvalMetricsResponse {
  evaluation: {
    dataset_size: number;
    collection: string;
    comparison: Record<
      string,
      {
        mode: string;
        total_queries: number;
        recall_at_5: number;
        recall_at_10: number;
        mrr: number;
        ndcg_at_10: number;
      }
    >;
    router_evaluation: {
      total_cases: number;
      passed: number;
      accuracy: number;
      cases: Array<{
        query: string;
        expected: string;
        predicted: string;
        score: number;
        passed: boolean;
      }>;
    };
  };
  sales_2025_preview: Array<{
    anio: number;
    trimestre: string;
    division: string;
    marca_lider: string;
    planta: string;
    unidades_vendidas: number;
    ingresos_cop_millones: number;
    meta_unidades: number;
    cumplimiento_pct: number;
  }>;
}
