"""Pruebas unitarias especializadas para el Gatekeeper System One (Jev)."""

from __future__ import annotations

import pytest
from src.agent.router import route_query_system_one


@pytest.mark.parametrize(
    ("query", "expected_choice", "expected_tools"),
    [
        ("Hola, buenos días", "DIRECT_GREETING", []),
        ("Me llamo Carlos y trabajo en Tecnoquímicas", "MEMORY_ONLY", []),
        ("¿Cómo me llamo?", "MEMORY_ONLY", []),
        (
            "¿Cuántas unidades y qué ingresos reportó TQ en Q3 de 2025?",
            "STRUCTURED_CSV",
            ["consultar_ventas_estructuradas_tq"],
        ),
        (
            "¿Cuál es la política de calidad y BPM de Tecnoquímicas?",
            "RAG_DOCUMENTAL",
            ["buscar_corpus_documental_tq"],
        ),
        (
            "Compara la meta documental con las ventas reales de Q3 2025 en el CSV",
            "MIXED_HYBRID",
            ["buscar_corpus_documental_tq", "consultar_ventas_estructuradas_tq"],
        ),
        ("Genera la orden oficial de exportación de auditoría para Q3 2025", "HITL_ACTION", None),
        ("¿Cuál es el precio exacto de Bayer en la farmacia de la esquina?", "OUT_OF_SCOPE", []),
    ],
)
def test_jev_routing_classification_matrix(
    query: str,
    expected_choice: str,
    expected_tools: list[str] | None,
) -> None:
    """Valida que Gatekeeper Jev clasifique cada intención sin desperdiciar búsquedas."""
    # Arrange / Act
    decision = route_query_system_one(query)

    # Assert
    assert decision.choice == expected_choice
    assert 0.8 <= decision.score <= 1.0
    assert decision.reasoning
    if expected_tools is not None:
        assert decision.box.get("tools_allowed") == expected_tools


def test_jev_extracts_quarter_year_and_division_into_box() -> None:
    """Valida extracción de parámetros estructurales (anio, trimestre, division) en Box."""
    # Arrange
    query = "Muéstrame las ventas de Winny en el segundo trimestre de 2024"

    # Act
    decision = route_query_system_one(query)

    # Assert
    assert decision.choice == "STRUCTURED_CSV"
    assert decision.box["anio"] == 2024
    assert decision.box["trimestre"] == "Q2"
    assert decision.box["division"] == "Cuidado Bebé"
    assert "Winny" in decision.noul or "2024" in decision.noul


def test_jev_greeting_explicitly_sets_bypass_flags() -> None:
    """Verifica que un saludo puro marque bypass total de Qdrant y CSV."""
    # Arrange / Act
    decision = route_query_system_one("¡Hola! ¿Cómo estás hoy?")

    # Assert
    assert decision.choice == "DIRECT_GREETING"
    assert decision.box.get("bypass_rag") is True
    assert decision.box.get("bypass_csv") is True
    assert decision.box.get("tools_allowed") == []


def test_jev_short_followup_uses_history_without_useless_rag() -> None:
    """Con historial activo, una aclaración corta usa memoria de corto plazo."""
    # Arrange / Act
    decision = route_query_system_one("¿Y el de abril?", has_history=True)

    # Assert
    assert decision.choice == "MEMORY_ONLY"
    assert decision.box.get("use_short_term_checkpointer") is True
