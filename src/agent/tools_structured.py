"""Herramientas deterministas con validación estricta Pydantic v2 sobre datos CSV/JSON de TQ."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, Literal

from langchain_core.tools import tool
from pydantic import BaseModel, Field, field_validator
from src.core.config import config

ROOT_DIR = Path(__file__).resolve().parent.parent.parent

_TRIMESTRE_ALIAS = {
    "1": "Q1",
    "T1": "Q1",
    "1T": "Q1",
    "PRIMER TRIMESTRE": "Q1",
    "PRIMERO": "Q1",
    "2": "Q2",
    "T2": "Q2",
    "2T": "Q2",
    "SEGUNDO TRIMESTRE": "Q2",
    "SEGUNDO": "Q2",
    "3": "Q3",
    "T3": "Q3",
    "3T": "Q3",
    "TERCER TRIMESTRE": "Q3",
    "TERCERO": "Q3",
    "4": "Q4",
    "T4": "Q4",
    "4T": "Q4",
    "CUARTO TRIMESTRE": "Q4",
    "CUARTO": "Q4",
    "ALL": "TODOS",
    "TODOS": "TODOS",
    "ANUAL": "TODOS",
}


class SalesQueryInput(BaseModel):
    """Esquema de entrada validado para consultas deterministas sobre ventas trimestrales de TQ."""

    anio: int | None = Field(
        default=2025,
        description="Año fiscal a consultar (valores válidos: 2024, 2025 o 2026; None para todos).",
    )
    trimestre: str = Field(
        default="Q3",
        description="Trimestre fiscal: 'Q1', 'Q2', 'Q3', 'Q4' o 'TODOS'.",
    )
    division: str | None = Field(
        default=None,
        description=(
            "Filtro opcional por división de negocio "
            "(ej. 'Farma', 'Consumo Masivo', 'Cuidado Bebé', 'Internacional')."
        ),
    )
    marca: str | None = Field(
        default=None,
        description="Filtro opcional por marca líder (ej. 'MK', 'Bonfiest', 'Noraver', 'Winny').",
    )
    operacion: Literal[
        "suma_unidades",
        "suma_ingresos",
        "promedio_cumplimiento",
        "detalle_completo",
        "comparar_meta",
    ] = Field(
        default="detalle_completo",
        description="Tipo de agregación determinista a calcular en Python.",
    )

    @field_validator("anio")
    @classmethod
    def validate_year(cls, value: int | None) -> int | None:
        if value is not None and value not in {2024, 2025, 2026}:
            raise ValueError(
                f"Año '{value}' fuera de rango corporativo. "
                "Corrige el parámetro 'anio' usando 2024, 2025 o 2026."
            )
        return value

    @field_validator("trimestre")
    @classmethod
    def normalize_quarter(cls, value: str) -> str:
        clean = value.strip().upper()
        if clean in {"Q1", "Q2", "Q3", "Q4", "TODOS"}:
            return clean
        if clean in _TRIMESTRE_ALIAS:
            return _TRIMESTRE_ALIAS[clean]
        raise ValueError(
            f"Trimestre '{value}' no reconocido. "
            "Corrige el argumento 'trimestre' a uno de: 'Q1', 'Q2', 'Q3', 'Q4' o 'TODOS'."
        )


class SalesDivisionRow(BaseModel):
    """Fila estructurada verificada desde el CSV corporativo."""

    anio: int
    trimestre: str
    division: str
    marca_lider: str
    planta: str
    unidades_vendidas: int
    ingresos_cop_millones: float
    meta_unidades: int
    cumplimiento_pct: float


class SalesQueryResult(BaseModel):
    """Resultado determinista auditado sin aritmética aproximada del LLM."""

    consulta_ejecutada: str
    filtros_aplicados: dict[str, Any]
    total_unidades_vendidas: int
    total_ingresos_cop_millones: float
    meta_unidades_total: int
    cumplimiento_global_pct: float
    cumplimiento_promedio_divisiones_pct: float
    registros_coincidentes: int
    indicadores_corporativos: dict[str, Any]
    desglose: list[SalesDivisionRow]
    fuente_verificada: str


class AuditExportInput(BaseModel):
    """Esquema para solicitar la emisión oficial de un reporte de auditoría (requiere HITL)."""

    anio: int = Field(default=2025, description="Año del reporte de auditoría (2024-2026).")
    trimestre: str = Field(default="Q3", description="Trimestre del reporte (Q1, Q2, Q3, Q4).")
    formato: Literal["PDF_EJECUTIVO", "CSV_FIRMADO", "JSON_AUDITORIA"] = Field(
        default="JSON_AUDITORIA",
        description="Formato de exportación oficial.",
    )
    destinatario: str = Field(
        default="Comité de Auditoría y Calidad TQ",
        min_length=3,
        description="Área o responsable destinatario del documento oficial.",
    )

    @field_validator("trimestre")
    @classmethod
    def normalize_export_quarter(cls, value: str) -> str:
        clean = value.strip().upper()
        if clean in {"Q1", "Q2", "Q3", "Q4"}:
            return clean
        if clean in _TRIMESTRE_ALIAS and _TRIMESTRE_ALIAS[clean] != "TODOS":
            return _TRIMESTRE_ALIAS[clean]
        raise ValueError("Trimestre inválido para exportación. Usa 'Q1', 'Q2', 'Q3' o 'Q4'.")


class AuditExportResult(BaseModel):
    """Confirmación estructurada de orden de exportación aprobada por humano (HITL)."""

    estado: Literal["APROBADA_Y_EJECUTADA", "RECHAZADA_POR_OPERADOR"]
    codigo_orden: str
    anio: int
    trimestre: str
    formato: str
    destinatario: str
    total_unidades_certificadas: int
    total_ingresos_cop_millones: float
    observacion: str


def _resolve_path(relative_or_abs: str) -> Path:
    path = Path(relative_or_abs)
    return path if path.is_absolute() else ROOT_DIR / path


def load_corporate_indicators() -> dict[str, Any]:
    """Carga indicadores corporativos y metas oficiales desde JSON."""
    json_path = _resolve_path(config.structured_portfolio_json)
    if not json_path.exists():
        return {}
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)
    return data.get("indicadores_corporativos", {})


def load_sales_rows() -> list[SalesDivisionRow]:
    """Carga y valida todas las filas del CSV de ventas trimestrales."""
    csv_path = _resolve_path(config.structured_sales_csv)
    if not csv_path.exists():
        raise FileNotFoundError(f"No se encontró el dataset estructurado en: {csv_path}")

    rows: list[SalesDivisionRow] = []
    with open(csv_path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            rows.append(
                SalesDivisionRow(
                    anio=int(raw["anio"]),
                    trimestre=raw["trimestre"].strip().upper(),
                    division=raw["division"].strip(),
                    marca_lider=raw["marca_lider"].strip(),
                    planta=raw["planta"].strip(),
                    unidades_vendidas=int(raw["unidades_vendidas"]),
                    ingresos_cop_millones=float(raw["ingresos_cop_millones"]),
                    meta_unidades=int(raw["meta_unidades"]),
                    cumplimiento_pct=float(raw["cumplimiento_pct"]),
                )
            )
    return rows


def execute_sales_query(params: SalesQueryInput) -> SalesQueryResult:
    """Ejecuta cálculos exactos sobre el CSV de ventas y metas corporativas."""
    all_rows = load_sales_rows()
    filtered = [
        r
        for r in all_rows
        if (params.anio is None or r.anio == params.anio)
        and (params.trimestre == "TODOS" or r.trimestre == params.trimestre)
        and (not params.division or params.division.lower() in r.division.lower())
        and (not params.marca or params.marca.lower() in r.marca_lider.lower())
    ]

    if not filtered:
        raise ValueError(
            "No existen registros para los filtros indicados. "
            "Prueba quitando el filtro de división/marca o usa anio=2025, trimestre='Q3'."
        )

    total_units = sum(r.unidades_vendidas for r in filtered)
    total_revenue = round(sum(r.ingresos_cop_millones for r in filtered), 2)
    total_target = sum(r.meta_unidades for r in filtered)
    global_compliance = round((total_units / total_target) * 100, 2) if total_target else 0.0
    avg_compliance = round(sum(r.cumplimiento_pct for r in filtered) / len(filtered), 2)

    return SalesQueryResult(
        consulta_ejecutada=params.operacion,
        filtros_aplicados={
            "anio": params.anio,
            "trimestre": params.trimestre,
            "division": params.division,
            "marca": params.marca,
        },
        total_unidades_vendidas=total_units,
        total_ingresos_cop_millones=total_revenue,
        meta_unidades_total=total_target,
        cumplimiento_global_pct=global_compliance,
        cumplimiento_promedio_divisiones_pct=avg_compliance,
        registros_coincidentes=len(filtered),
        indicadores_corporativos=load_corporate_indicators(),
        desglose=filtered,
        fuente_verificada=config.structured_sales_csv,
    )


def _format_validation_error(err: Exception) -> str:
    """Devuelve errores pedagógicos para que el agente LLM autocorrija los parámetros."""
    return json.dumps(
        {
            "error_validacion": str(err),
            "accion_correctiva": (
                "Reintenta especificando anio en {2024, 2025, 2026} "
                "y trimestre en {'Q1', 'Q2', 'Q3', 'Q4', 'TODOS'}."
            ),
        },
        ensure_ascii=False,
    )


@tool("consultar_ventas_estructuradas_tq", args_schema=SalesQueryInput)
def consultar_ventas_estructuradas_tq(
    anio: int | None = 2025,
    trimestre: str = "Q3",
    division: str | None = None,
    marca: str | None = None,
    operacion: str = "detalle_completo",
) -> str:
    """Consulta determinista sobre el CSV de ventas trimestrales y metas de Tecnoquímicas S.A.

    Utiliza esta herramienta SIEMPRE que el usuario pregunte por unidades vendidas, ingresos en
    millones de COP, cumplimiento de metas por trimestre (Q1, Q2, Q3, Q4), año o división
    (Farma MK, Consumo Masivo, Cuidado Bebé Winny, Internacional Latam).
    Retorna un JSON validado con Pydantic v2 calculado exactamente en Python.
    """
    try:
        validated = SalesQueryInput(
            anio=anio,
            trimestre=trimestre,
            division=division,
            marca=marca,
            operacion=operacion,  # type: ignore[arg-type]
        )
        result = execute_sales_query(validated)
        return result.model_dump_json(indent=2)
    except Exception as exc:
        return _format_validation_error(exc)


consultar_ventas_estructuradas_tq.handle_validation_error = _format_validation_error


@tool("generar_orden_exportacion_auditoria", args_schema=AuditExportInput)
def generar_orden_exportacion_auditoria(
    anio: int = 2025,
    trimestre: str = "Q3",
    formato: str = "JSON_AUDITORIA",
    destinatario: str = "Comité de Auditoría y Calidad TQ",
) -> str:
    """Emite una orden oficial certificada de exportación financiera (acción crítica con HITL).

    Esta herramienta requiere aprobación explícita del operador humano (Human-in-the-Loop) antes
    de ejecutarse en producción. Úsala únicamente cuando el usuario solicite generar, emitir o
    exportar un reporte oficial de auditoría trimestral.
    """
    validated = AuditExportInput(
        anio=anio,
        trimestre=trimestre,
        formato=formato,  # type: ignore[arg-type]
        destinatario=destinatario,
    )
    query_res = execute_sales_query(
        SalesQueryInput(anio=validated.anio, trimestre=validated.trimestre)
    )
    export_res = AuditExportResult(
        estado="APROBADA_Y_EJECUTADA",
        codigo_orden=f"TQ-AUD-{validated.anio}-{validated.trimestre}-001",
        anio=validated.anio,
        trimestre=validated.trimestre,
        formato=validated.formato,
        destinatario=validated.destinatario,
        total_unidades_certificadas=query_res.total_unidades_vendidas,
        total_ingresos_cop_millones=query_res.total_ingresos_cop_millones,
        observacion=(
            f"Reporte {validated.formato} generado con cifras verificadas de "
            f"{validated.anio} {validated.trimestre} para {validated.destinatario}."
        ),
    )
    return export_res.model_dump_json(indent=2)


STRUCTURED_TOOLS = [consultar_ventas_estructuradas_tq, generar_orden_exportacion_auditoria]
