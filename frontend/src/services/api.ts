import type {
  CheckpointInfo,
  EvalMetricsResponse,
  HealthStatus,
  LongTermStoreProfile,
  Modulo1Overview,
  Modulo1PytestResult,
  ThreadSummary,
} from "../types/agent";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export interface SSEHandlers {
  onEvent: (event: string, data: unknown) => void;
  onError: (err: string) => void;
}

async function consumeSSE(response: Response, handlers: SSEHandlers): Promise<void> {
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => response.statusText);
    handlers.onError(`Error HTTP ${response.status}: ${text}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      if (!frame.trim()) continue;
      let eventName = "message";
      const dataLines: string[] = [];

      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        }
      }

      if (dataLines.length > 0) {
        try {
          const parsed = JSON.parse(dataLines.join("\n"));
          handlers.onEvent(eventName, parsed);
        } catch {
          handlers.onEvent(eventName, dataLines.join("\n"));
        }
      }
    }
  }
}

export async function streamChatMessage(
  payload: { thread_id: string; user_id: string; message: string },
  handlers: SSEHandlers,
): Promise<void> {
  const resp = await fetch(`${API_BASE}/api/v1/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await consumeSSE(resp, handlers);
}

export async function resumeHITLDecision(
  payload: {
    thread_id: string;
    user_id: string;
    decision: "approve" | "edit" | "reject";
    edited_args?: Record<string, unknown>;
  },
  handlers: SSEHandlers,
): Promise<void> {
  const resp = await fetch(`${API_BASE}/api/v1/chat/hitl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await consumeSSE(resp, handlers);
}

export async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetch(`${API_BASE}/api/v1/health`);
  if (!res.ok) throw new Error("No se pudo conectar con el backend FastAPI.");
  return res.json();
}

export async function fetchThreads(): Promise<ThreadSummary[]> {
  const res = await fetch(`${API_BASE}/api/v1/threads`);
  if (!res.ok) throw new Error("Error al listar hilos.");
  const data = await res.json();
  return data.threads ?? [];
}

export async function fetchThreadDetail(threadId: string): Promise<{
  thread_id: string;
  traces: Array<{
    trace_id: number;
    checkpoint_id: string | null;
    user_query: string;
    assistant_response: string;
    router_decision: Record<string, unknown>;
    steps: Array<Record<string, unknown>>;
    citations: Array<Record<string, unknown>>;
    created_at: string;
  }>;
  checkpoints: CheckpointInfo[];
  pending_interrupt: unknown;
}> {
  const res = await fetch(`${API_BASE}/api/v1/threads/${encodeURIComponent(threadId)}`);
  if (!res.ok) throw new Error("Error al recuperar el estado del hilo.");
  return res.json();
}

export async function forkThread(
  threadId: string,
  checkpointId?: string | null,
): Promise<{ source_thread_id: string; new_thread_id: string }> {
  const res = await fetch(`${API_BASE}/api/v1/threads/${encodeURIComponent(threadId)}/fork`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ checkpoint_id: checkpointId ?? null }),
  });
  if (!res.ok) throw new Error("No se pudo bifurcar el hilo.");
  return res.json();
}

export async function deleteThread(threadId: string): Promise<void> {
  await fetch(`${API_BASE}/api/v1/threads/${encodeURIComponent(threadId)}`, {
    method: "DELETE",
  });
}

export async function fetchLongTermStore(userId: string): Promise<LongTermStoreProfile> {
  const res = await fetch(
    `${API_BASE}/api/v1/memory/store?user_id=${encodeURIComponent(userId)}`,
  );
  if (!res.ok) throw new Error("Error al leer Store de largo plazo.");
  return res.json();
}

export async function toggleInjectionTrap(
  enabled: boolean,
): Promise<{ trap_enabled: boolean; stats: HealthStatus["qdrant_stats"] }> {
  const res = await fetch(`${API_BASE}/api/v1/rag/inject-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error("Error al configurar trampa de inyección.");
  return res.json();
}

export async function fetchEvaluationMetrics(): Promise<EvalMetricsResponse> {
  const res = await fetch(`${API_BASE}/api/v1/eval/metrics`);
  if (!res.ok) throw new Error("Error al cargar métricas de evaluación.");
  return res.json();
}

export async function shutdownSystem(): Promise<{ status: string; message: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/system/shutdown`, {
      method: "POST",
    });
    if (res.ok) {
      return res.json();
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      return {
        status: "shutting_down",
        message: "Sistema apagado y puertos TCP liberados.",
      };
    }
  } catch {
    return {
      status: "shutting_down",
      message: "Sistema apagado y puertos TCP liberados.",
    };
  }

  if (API_BASE !== "http://127.0.0.1:8000") {
    try {
      const direct = await fetch("http://127.0.0.1:8000/api/v1/system/shutdown", {
        method: "POST",
      });
      if (direct.ok) {
        return direct.json();
      }
    } catch {
      // Puerto 8000 directo no disponible o cerrado durante el apagado
    }
  }

  throw new Error("No se pudo ejecutar el apagado del sistema.");
}

export async function fetchM1Overview(): Promise<Modulo1Overview> {
  const res = await fetch(`${API_BASE}/api/v1/m1/overview`);
  if (!res.ok) throw new Error("Error al cargar telemetría del Módulo 1.");
  return res.json();
}

export async function streamM1Task(
  payload: { task: "qa" | "summary" | "faq"; question?: string },
  handlers: SSEHandlers,
): Promise<void> {
  const resp = await fetch(`${API_BASE}/api/v1/m1/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await consumeSSE(resp, handlers);
}

export async function runM1Pytest(): Promise<Modulo1PytestResult> {
  const res = await fetch(`${API_BASE}/api/v1/m1/run-pytest`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Error al ejecutar suite pytest.");
  return res.json();
}

export function getM1ArchitectureUrl(): string {
  return `${API_BASE}/api/v1/m1/architecture-html`;
}
