"""Evaluador cuantitativo del sistema RAG (Recall@5, Recall@10, MRR, nDCG@10) y Router."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from src.agent.rag_qdrant import HybridQdrantRAG, get_rag_engine
from src.agent.router import route_query_system_one
from src.core.config import config

ROOT_DIR = Path(__file__).resolve().parent.parent.parent


def _compute_dcg(relevances: list[int]) -> float:
    return sum(rel / math.log2(idx + 2) for idx, rel in enumerate(relevances))


def evaluate_retrieval_mode(
    rag: HybridQdrantRAG,
    dataset: list[dict[str, Any]],
    mode: str,
    k: int = 10,
) -> dict[str, Any]:
    """Evalúa un modo de recuperación ('dense', 'lexical' o 'hybrid') sobre el dataset."""
    recall_5_hits = 0
    recall_10_hits = 0
    mrr_sum = 0.0
    ndcg_sum = 0.0
    per_query: list[dict[str, Any]] = []

    for item in dataset:
        expected = set(item["expected_sections"])
        hits = rag.search(query=item["query"], top_k=k, mode=mode)
        retrieved_sections = [h["section"] for h in hits]

        # Relevancia binaria por sección esperada (deduplicando documento/sección para IDCG justo)
        rel_vector = [1 if sec in expected else 0 for sec in retrieved_sections]
        hit_5 = int(any(sec in expected for sec in retrieved_sections[:5]))
        hit_10 = int(any(sec in expected for sec in retrieved_sections[:10]))
        recall_5_hits += hit_5
        recall_10_hits += hit_10

        rr = 0.0
        for rank, rel in enumerate(rel_vector, start=1):
            if rel == 1:
                rr = 1.0 / rank
                break
        mrr_sum += rr

        dcg = _compute_dcg(rel_vector)
        ideal_count = min(len(rel_vector), max(1, sum(rel_vector)))
        idcg = _compute_dcg([1] * ideal_count + [0] * (len(rel_vector) - ideal_count))
        ndcg = (dcg / idcg) if idcg > 0 else 0.0
        ndcg_sum += ndcg

        per_query.append(
            {
                "id": item["id"],
                "hit_at_5": bool(hit_5),
                "hit_at_10": bool(hit_10),
                "rr": round(rr, 4),
                "ndcg_at_10": round(ndcg, 4),
                "top_section": retrieved_sections[0] if retrieved_sections else None,
            }
        )

    n = max(1, len(dataset))
    return {
        "mode": mode,
        "total_queries": len(dataset),
        "recall_at_5": round(recall_5_hits / n, 4),
        "recall_at_10": round(recall_10_hits / n, 4),
        "mrr": round(mrr_sum / n, 4),
        "ndcg_at_10": round(ndcg_sum / n, 4),
        "details": per_query,
    }


def evaluate_router_accuracy() -> dict[str, Any]:
    """Evalúa la precisión del Gatekeeper System One (Jev) frente a las 5 categorías."""
    cases = [
        ("¡Hola! Buenos días", "DIRECT_GREETING"),
        ("Muchas gracias", "DIRECT_GREETING"),
        ("Me llamo Ana y trabajo en Carvajal", "MEMORY_ONLY"),
        ("¿Dónde trabajo?", "MEMORY_ONLY"),
        ("¿Cuántas unidades se vendieron en el tercer trimestre de 2025?", "STRUCTURED_CSV"),
        ("¿Cuáles fueron los ingresos de Q1 2026?", "STRUCTURED_CSV"),
        ("¿Qué dice el corpus sobre la política de calidad y BPM?", "RAG_DOCUMENTAL"),
        ("¿Cuál es la línea telefónica gratuita nacional?", "RAG_DOCUMENTAL"),
        ("Compara la meta del documento con las ventas reales del CSV en Q3", "MIXED_HYBRID"),
        ("Genera la orden oficial de exportación de auditoría Q3 2025", "HITL_ACTION"),
        ("¿Cuál es el precio exacto de Bonfiest en droguerías externas?", "OUT_OF_SCOPE"),
    ]
    passed = 0
    results: list[dict[str, Any]] = []
    for query, expected in cases:
        dec = route_query_system_one(query)
        ok = dec.choice == expected
        if ok:
            passed += 1
        results.append(
            {
                "query": query,
                "expected": expected,
                "predicted": dec.choice,
                "score": dec.score,
                "passed": ok,
            }
        )
    return {
        "total_cases": len(cases),
        "passed": passed,
        "accuracy": round(passed / len(cases), 4),
        "cases": results,
    }


def run_full_m2_evaluation(save_report: bool = True) -> dict[str, Any]:
    """Ejecuta el benchmark completo de Retrieval (Densa vs Léxica vs Híbrida) y Router."""
    dataset_path = ROOT_DIR / config.m2_eval_dataset_path
    with open(dataset_path, encoding="utf-8") as f:
        dataset = json.load(f)

    rag = get_rag_engine()
    dense_metrics = evaluate_retrieval_mode(rag, dataset, mode="dense")
    lexical_metrics = evaluate_retrieval_mode(rag, dataset, mode="lexical")
    hybrid_metrics = evaluate_retrieval_mode(rag, dataset, mode="hybrid")
    router_metrics = evaluate_router_accuracy()

    report = {
        "dataset_size": len(dataset),
        "collection": rag.collection_name,
        "comparison": {
            "dense": {k: v for k, v in dense_metrics.items() if k != "details"},
            "lexical": {k: v for k, v in lexical_metrics.items() if k != "details"},
            "hybrid_rrf": {k: v for k, v in hybrid_metrics.items() if k != "details"},
        },
        "router_evaluation": router_metrics,
        "hybrid_query_details": hybrid_metrics["details"],
    }

    if save_report:
        out_path = ROOT_DIR / config.m2_eval_metrics_path
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

    return report


if __name__ == "__main__":
    summary = run_full_m2_evaluation(save_report=True)
    print(json.dumps(summary["comparison"], indent=2))
