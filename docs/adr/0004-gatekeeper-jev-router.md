# ADR-0004: Enrutamiento Gatekeeper System One (Jev: `Choice, Noul, Score, Box`)

- **Fecha:** 2026-11-13
- **Estado:** Aceptada
- **Componentes:** `src/agent/router.py`

## Contexto
Enviar todas las consultas directamente al pipeline RAG desperdicia embeddings, latencia y tokens en saludos simples o preguntas personales, además de confundir preguntas cuantitativas de ventas con texto plano.

## Decisión
Implementar el modelo tipado Pydantic `RouterDecision` (`choice`, `noul`, `score`, `box`, `reasoning`) antes de invocar herramientas:
- `DIRECT_GREETING` / `MEMORY_ONLY` / `OUT_OF_SCOPE` $\to$ **0 consultas a Qdrant**.
- `STRUCTURED_CSV` $\to$ `@tool consultar_ventas_estructuradas_tq` con aritmética exacta en Python.
- `RAG_DOCUMENTAL` $\to$ Qdrant híbrido RRF.
- `MIXED_HYBRID` $\to$ coordina ambas fuentes en un mismo turno.
- `HITL_ACTION` $\to$ activa `interrupt()` en `hitl_gate`.

## Verificación
Precisión medida del **100%** (11/11 escenarios en `evaluate_router_accuracy()`).
