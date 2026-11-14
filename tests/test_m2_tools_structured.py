"""Pruebas unitarias para @tool deterministas y contratos Pydantic v2."""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError
from src.agent.tools_structured import (
    AuditExportInput,
    SalesQueryInput,
    consultar_ventas_estructuradas_tq,
    execute_sales_query,
    generar_orden_exportacion_auditoria,
)


def test_sales_query_normalizes_quarter_aliases() -> None:
    """Normaliza alias en español ('tercer trimestre', '3t', 'anual') a Q1-Q4/TODOS."""
    # Arrange / Act
    q3_a = SalesQueryInput(anio=2025, trimestre="tercer trimestre")
    q3_b = SalesQueryInput(anio=2025, trimestre="3T")
    todos = SalesQueryInput(anio=2025, trimestre="anual")

    # Assert
    assert q3_a.trimestre == "Q3"
    assert q3_b.trimestre == "Q3"
    assert todos.trimestre == "TODOS"


def test_sales_query_rejects_invalid_year_with_pedagogical_message() -> None:
    """La herramienta devuelve error guiado para autocorrección del agente si año no existe."""
    # Arrange / Act
    raw = consultar_ventas_estructuradas_tq.invoke(
        {"anio": 1995, "trimestre": "Q3", "operacion": "detalle_completo"}
    )
    parsed = json.loads(raw)

    # Assert
    assert "error_validacion" in parsed
    assert "2024, 2025 o 2026" in parsed["accion_correctiva"]


def test_execute_sales_query_computes_exact_q3_2025_totals() -> None:
    """Verifica aritmética determinista exacta de Q3 2025 sobre el CSV Gold."""
    # Arrange
    params = SalesQueryInput(anio=2025, trimestre="Q3", operacion="detalle_completo")

    # Act
    result = execute_sales_query(params)

    # Assert
    assert result.total_unidades_vendidas == 6_400_000
    assert result.total_ingresos_cop_millones == 210_000.0
    assert result.registros_coincidentes >= 4


def test_audit_export_tool_and_input_validation() -> None:
    """Valida esquema HITL AuditExportInput y generación certificada de orden."""
    # Arrange / Act
    payload = json.loads(
        generar_orden_exportacion_auditoria.invoke(
            {
                "anio": 2025,
                "trimestre": "Q3",
                "formato": "JSON_AUDITORIA",
                "destinatario": "Comité Calidad TQ",
            }
        )
    )

    # Assert
    assert payload["estado"] == "APROBADA_Y_EJECUTADA"
    assert payload["total_unidades_certificadas"] == 6_400_000
    with pytest.raises(ValidationError):
        AuditExportInput(anio=2030, trimestre="Q3", formato="JSON_AUDITORIA")
