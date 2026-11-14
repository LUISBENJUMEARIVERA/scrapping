# ADR-0002: Motor RAG Híbrido en Qdrant (`HNSW` + RRF Densa y Léxica)

- **Fecha:** 2026-11-13
- **Estado:** Aceptada
- **Componentes:** `src/agent/rag_qdrant.py`, `src/agent/evaluator.py`

## Contexto
Las consultas corporativas de Tecnoquímicas combinan lenguaje natural semántico (políticas de calidad, sostenibilidad) con términos exactos regulatorios o farmacéuticos (`BPM`, `INVIMA`, `ISO`, nombres de plantas como `Villa Rica`).

## Decisión
Implementar búsqueda híbrida en **Qdrant** sobre índice **ANN `HNSW (m=16, ef_construct=100)`** combinando recuperación densa coseno y recuperación léxica dispersa BM25 mediante **Reciprocal Rank Fusion (RRF)** y devolviendo citas verificables (`title`, `section`, `url`, `content`, `score`).

## Evidencia Cuantitativa (25 consultas etiquetadas)
- Dense Only: `Recall@10 = 0.96`, `MRR = 0.8133`
- Lexical Only: `Recall@10 = 0.96`, `MRR = 0.8744`
- **Hybrid RRF:** **`Recall@10 = 1.00`**, **`MRR = 0.8800`**, **`nDCG@10 = 0.8475`**
