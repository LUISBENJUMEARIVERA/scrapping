# Especificación Versionada — Agente Conversacional Tecnoquímicas S.A. (Módulo 2)

> **Spec ID:** `TQ-M2-AGENT-SPEC-2.1.0`  
> **Estado:** Vigente y verificado en código (`src/agent/`, `api/`, `frontend/`).

---

## 1. Principio Rector (Anti-Chat Ingenuo)

Un agente multi-paso no es un prompt más largo ni cabe en un `POST` bloqueante con un spinner de 25 segundos. Este sistema implementa un contrato explícito entre:

1. **Modelo que decide** (`init_chat_model` + `RouterDecision` System One Jev).
2. **Runtime determinista que ejecuta** (`StateGraph` de LangGraph con herramientas `@tool` tipadas en Pydantic v2, memoria dual persistente y blindaje RAG).
3. **Interfaz reactiva desacoplada** (SPA React 19 + Vite consumiendo un flujo Server-Sent Events multi-evento).

---

## 2. Contrato de Estado (`TQAgentState`)

| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `messages` | `Annotated[list[AnyMessage], add_messages]` | Historial conversacional gestionado por `SqliteSaver` (`thread_id`). |
| `user_id` | `str` | Clave de namespace para memoria de largo plazo `("users", user_id, "profile")`. |
| `query` | `str` | Consulta actual del usuario. |
| `router_decision` | `dict[str, Any]` | Estructura Jev: `choice`, `noul`, `score`, `box`, `reasoning`. |
| `memory_context` | `dict[str, Any]` | Perfil cargado desde `PersistentMemoryStore.search()` y hechos nuevos extraídos. |
| `trim_report` | `dict[str, Any]` | Telemetría de `trim_messages` (`original_tokens`, `kept_tokens`, `trimmed`). |
| `tool_observations` | `list[dict[str, Any]]` | Resultados exactos devueltos por CSV o Qdrant. |
| `citations` | `list[dict[str, Any]]` | Citas verificables (`chunk_id`, `title`, `section`, `url`, `score`). |
| `shield_triggered` | `bool` | Indica si `rag_shield.py` detectó y neutralizó prompt injection indirecto. |
| `react_steps` | `list[dict[str, Any]]` | Traza ordenada de pasos (`memory`, `router`, `thought`, `action`, `observation`). |

---

## 3. Protocolo SSE Multi-Evento (`/api/v1/chat/stream` y `/api/v1/chat/hitl`)

| Evento SSE | Payload | Efecto en Frontend |
| :--- | :--- | :--- |
| `memory` | Estadísticas de contexto + perfil `Store` | Muestra sincronización de corto/largo plazo en `ReActTimeline`. |
| `router` | `RouterDecision` (`Choice`, `Noul`, `Score`, `Box`) | Despliega chip de ruta Jev y entidades extraídas. |
| `thought` | Plan de acción y herramientas habilitadas | Muestra el razonamiento previo a la acción. |
| `action` | Nombre de `@tool` + argumentos Pydantic validados | Renderiza tarjeta de invocación de herramienta. |
| `observation` | Salida estructurada CSV / Qdrant + estado del blindaje | Muestra cifras exactas o alerta `Inyección Bloqueada`. |
| `interrupt` | Objeto HITL (`tool`, `proposed_args`, `options`) | Pausa el grafo y despliega `HITLBanner` (`Aprobar`, `Editar`, `Rechazar`). |
| `token` | `{"delta": "..."}` | Streaming progresivo de la respuesta en pantalla. |
| `citations` | Lista de citas y fragmentos verificables | Renderiza enlaces trazables al corpus oficial. |
| `done` | `thread_id`, `checkpoint_id`, `latency_ms` | Persiste la traza en SQLite y actualiza panel Time-Travel. |

---

## 4. Invariantes de Seguridad y Fidelidad

1. **Cero alucinación aritmética:** Todo cálculo sobre ventas, ingresos o cumplimiento porcentual ocurre en Python sobre `data/gold/tq_ventas_trimestrales.csv` mediante `SalesQueryInput` / `SalesQueryResult`.
2. **Aislamiento de datos pasivos (Blindaje RAG):** Los fragmentos recuperados de Qdrant se envuelven en `<contexto_documental_pasivo politica="SOLO_DATOS_NO_EJECUTABLES">` y cualquier intento de anulación de instrucciones se marca como `ALERTA_INYECCION_BLOQUEADA`.
3. **Ahorro de búsquedas (Gatekeeper Jev):** Saludos (`DIRECT_GREETING`), preguntas personales (`MEMORY_ONLY`) y consultas fuera de alcance (`OUT_OF_SCOPE`) jamás disparan búsquedas vectoriales en Qdrant.
4. **Durabilidad ante fallos:** Recargar la página (`F5`) o reiniciar el proceso de FastAPI recupera el 100% de hilos, mensajes, checkpoints e interrupciones HITL pendientes desde `data/memory/checkpoints.sqlite`.

---

## 5. Ciclo de Vida, Apagado Seguro y Cumplimiento Anuncio 006

- **Arranque dinámico sin colisiones:** `scripts/run_agent.ps1` detiene listeners residuales en `8000..8010` / `5173..5185` (liberando `data/qdrant_db/.lock`) y enlaza `VITE_API_URL` al puerto libre detectado.
- **Apagado controlado (`POST /api/v1/system/shutdown`):** Cierra `SqliteSaver` (`checkpoints.sqlite`), libera `HybridQdrantRAG`, finaliza el servidor frontend y libera ambos puertos TCP.
- **Cobertura de rúbrica (`Anuncio 006`):** 13/13 ítems obligatorios y 7/7 extras deseables implementados y cubiertos por pruebas automatizadas.
