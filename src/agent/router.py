"""Router Agent y Gatekeeper System One (Patrón Jev: Choice, Noul, Score, Box)."""

from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field

RouteChoice = Literal[
    "DIRECT_GREETING",
    "MEMORY_ONLY",
    "STRUCTURED_CSV",
    "RAG_DOCUMENTAL",
    "MIXED_HYBRID",
    "HITL_ACTION",
    "OUT_OF_SCOPE",
]


class RouterDecision(BaseModel):
    """Decisión estructurada del Gatekeeper System One (Jev)."""

    choice: RouteChoice = Field(description="Ruta elegida por el Gatekeeper Jev.")
    noul: list[str] = Field(
        default_factory=list,
        description="Entidades o conceptos nucleares extraídos de la consulta.",
    )
    score: float = Field(
        ge=0.0,
        le=1.0,
        description="Confianza estimada de clasificación (0.0 a 1.0).",
    )
    box: dict[str, Any] = Field(
        default_factory=dict,
        description="Parámetros pre-extraídos y restricciones de ejecución (filtros/flags).",
    )
    reasoning: str = Field(description="Justificación legible de la decisión de enrutamiento.")


_GREETING_PATTERNS = re.compile(
    r"^\s*[¡!¿?\s]*(?:hola|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|saludos|"
    r"qu[eé]\s+tal|c[oó]mo\s+est[aá]s(?:\s+hoy)?|hey|hi|hello|gracias|muchas\s+gracias|"
    r"adi[oó]s|hasta\s+luego|ok|listo|perfecto)(?:[\s,!¡¿?.]*(?:hola|buenos\s+d[ií]as|"
    r"buenas\s+tardes|buenas\s+noches|qu[eé]\s+tal|c[oó]mo\s+est[aá]s(?:\s+hoy)?|"
    r"gracias|todo\s+bien))*[\s!¡¿?.,]*$",
    re.IGNORECASE,
)

_OUT_OF_SCOPE_PATTERNS = re.compile(
    r"(precio\s+exacto.*droguer[ií]a|bayer|pfizer|novartis|roche|"
    r"presidente\s+y\s+miembro\s+de\s+la\s+junta|ingresos\s+netos.*1980|"
    r"farmacia\s+de\s+la\s+esquina|partido\s+de\s+f[uú]tbol|clima\s+hoy|"
    r"receta\s+de\s+cocina|hor[oó]scopo|dosis\s+m[eé]dica\s+personal)",
    re.IGNORECASE,
)

_HITL_PATTERNS = re.compile(
    r"(genera.*orden\s+de\s+exportaci[oó]n|exporta.*auditor[ií]a|"
    r"emite.*reporte\s+oficial|aprueba.*exportaci[oó]n|"
    r"orden\s+oficial\s+de\s+auditor[ií]a|exportar\s+informe\s+oficial)",
    re.IGNORECASE,
)

_MEMORY_PATTERNS = re.compile(
    r"(me\s+llamo|mi\s+nombre\s+es|trabajo\s+en|d[oó]nde\s+trabajo|donde\s+trabajo|"
    r"c[oó]mo\s+me\s+llamo|como\s+me\s+llamo|cu[aá]l\s+es\s+mi\s+cargo|"
    r"recuerdas\s+(qui[eé]n|c[oó]mo|d[oó]nde)|qu[eé]\s+sabes\s+de\s+m[ií]|"
    r"prefiero\s+respuestas|mi\s+empresa)",
    re.IGNORECASE,
)

_STRUCTURED_KEYWORDS = re.compile(
    r"(ventas|unidades\s+vendidas|ingresos|cop|millones|trimestre|q1|q2|q3|q4|"
    r"cumplimiento|meta\s+de\s+unidades|csv|facturaci[oó]n\s+trimestral|"
    r"2024|2025|2026|divisi[oó]n\s+farma|winny|bonfiest)",
    re.IGNORECASE,
)

_RAG_KEYWORDS = re.compile(
    r"(corpus|documento|pol[ií]tica\s+de\s+calidad|calidad|bpm|invima|"
    r"historia|fundaci[oó]n|sede|casa\s+matriz|cali|villa\s+rica|jamund[ií]|"
    r"tel[eé]fono|l[ií]nea\s+gratuita|extensi[oó]n|correo|pruebas\s+en\s+animales|"
    r"estudios\s+cient[ií]ficos|bioequivalencia|colaboradores|educaci[oó]n|"
    r"carvajal|icesi|inversi[oó]n|recambios|beneficios\s+al\s+paciente|"
    r"distribuidor|semillero|donaci[oó]n|seguridad|auditor[ií]a|medicamentos\s+gratis|"
    r"inyecci[oó]n|tecnosur|tecnofar|portal)",
    re.IGNORECASE,
)

_MIXED_CUES = re.compile(
    r"(compara|comparar|contrasta|cruza|integra|vs\.?|versus|documento\s+con\s+las\s+ventas|"
    r"corpus\s+y\s+el\s+csv|meta\s+del\s+documento\s+con\s+el\s+csv)",
    re.IGNORECASE,
)


def _extract_quarter_and_year(text: str) -> dict[str, Any]:
    """Extrae filtros estructurados de año, trimestre y división para el Box de Jev."""
    box: dict[str, Any] = {"anio": 2025, "trimestre": "Q3", "division": None}

    year_match = re.search(r"\b(2024|2025|2026)\b", text)
    if year_match:
        box["anio"] = int(year_match.group(1))

    lower = text.lower()
    if re.search(r"\b(q1|1t|t1|primer\s+trimestre)\b", lower):
        box["trimestre"] = "Q1"
    elif re.search(r"\b(q2|2t|t2|segundo\s+trimestre)\b", lower):
        box["trimestre"] = "Q2"
    elif re.search(r"\b(q3|3t|t3|tercer\s+trimestre)\b", lower):
        box["trimestre"] = "Q3"
    elif re.search(r"\b(q4|4t|t4|cuarto\s+trimestre)\b", lower):
        box["trimestre"] = "Q4"
    elif re.search(r"\b(todos|todo\s+el\s+a[ñn]o|anual)\b", lower):
        box["trimestre"] = "TODOS"

    if "farma" in lower or "mk" in lower:
        box["division"] = "Farma"
    elif "consumo" in lower or "bonfiest" in lower or "noraver" in lower:
        box["division"] = "Consumo Masivo"
    elif "beb" in lower or "winny" in lower:
        box["division"] = "Cuidado Bebé"
    elif "internacional" in lower or "latam" in lower or "salvador" in lower:
        box["division"] = "Internacional"

    return box


def _extract_nouls(text: str) -> list[str]:
    """Extrae sustantivos y entidades clave para el slot Noul de System One."""
    candidates = re.findall(r"\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ0-9]{2,}\b|\bQ[1-4]\b|\b202[4-6]\b", text)
    keywords = re.findall(
        r"\b(ventas|unidades|ingresos|calidad|bpm|corpus|csv|qdrant|memoria|"
        r"auditor[ií]a|exportaci[oó]n|carvajal|tecnoqu[ií]micas|villa\s+rica|cali)\b",
        text,
        re.IGNORECASE,
    )
    merged = list(dict.fromkeys([*candidates, *[k.lower() for k in keywords]]))
    return merged[:8]


def route_query_system_one(
    query: str,
    profile: dict[str, Any] | None = None,
    has_history: bool = False,
) -> RouterDecision:
    """Clasifica la intención con latencia determinista (System One / Jev) sin quemar búsquedas."""
    clean = query.strip()
    nouls = _extract_nouls(clean)

    # 1. Acción crítica HITL en vivo
    if _HITL_PATTERNS.search(clean):
        params = _extract_quarter_and_year(clean)
        return RouterDecision(
            choice="HITL_ACTION",
            noul=nouls or ["auditoría", "exportación"],
            score=0.98,
            box={"requires_human_approval": True, **params},
            reasoning=(
                "Se detectó solicitud de emisión/exportación oficial de auditoría; "
                "el runtime exige pausa HITL (Human-in-the-Loop) para aprobar, editar o rechazar."
            ),
        )

    # 2. Saludo o cortesía pura -> NO quema búsqueda en Qdrant ni CSV
    if _GREETING_PATTERNS.match(clean):
        return RouterDecision(
            choice="DIRECT_GREETING",
            noul=nouls,
            score=0.99,
            box={"tools_allowed": [], "bypass_rag": True, "bypass_csv": True},
            reasoning=(
                "Saludo o cortesía simple: Gatekeeper Jev responde directamente sin "
                "quemar búsquedas en Qdrant ni consultar archivos CSV."
            ),
        )

    # 3. Fuera de alcance farmacéutico o competidores -> rechazo calibrado
    if _OUT_OF_SCOPE_PATTERNS.search(clean):
        return RouterDecision(
            choice="OUT_OF_SCOPE",
            noul=nouls,
            score=0.96,
            box={"tools_allowed": [], "enforce_oos_contract": True},
            reasoning=(
                "Consulta fuera del dominio corporativo oficial de TQ (precios externos, "
                "competidores o información histórica no auditable); aplica protocolo de rechazo."
            ),
        )

    has_structured = bool(_STRUCTURED_KEYWORDS.search(clean))
    has_rag = bool(_RAG_KEYWORDS.search(clean))
    has_mixed_cue = bool(_MIXED_CUES.search(clean))
    is_memory_query = bool(_MEMORY_PATTERNS.search(clean))

    # 4. Memoria de perfil / identidad personal (Store o hilo) sin necesidad de RAG/CSV
    if (
        is_memory_query
        and not has_structured
        and (not has_rag or "carvajal" in clean.lower())
        and not any(w in clean.lower() for w in ("convenio", "fundación", "aporte", "millones"))
    ):
        # Si dice "Me llamo Ana y trabajo en Carvajal" o "¿Dónde trabajo?", va a MEMORY_ONLY
        return RouterDecision(
            choice="MEMORY_ONLY",
            noul=nouls or ["perfil_usuario"],
            score=0.95,
            box={
                "tools_allowed": [],
                "use_short_term_checkpointer": True,
                "use_long_term_store": True,
                "profile_keys_loaded": list((profile or {}).keys()),
            },
            reasoning=(
                "Gestión/consulta de identidad y memoria conversacional (corto y largo plazo) "
                "mediante Checkpointer SqliteSaver y Store por namespace; cero búsquedas RAG."
            ),
        )

    # 5. Enrutamiento Mixto (RAG + CSV en el mismo plan)
    if (has_structured and has_rag) or (has_mixed_cue and (has_structured or has_rag)):
        params = _extract_quarter_and_year(clean)
        return RouterDecision(
            choice="MIXED_HYBRID",
            noul=nouls,
            score=0.94,
            box={
                "tools_allowed": [
                    "buscar_corpus_documental_tq",
                    "consultar_ventas_estructuradas_tq",
                ],
                **params,
            },
            reasoning=(
                "Consulta híbrida que requiere contrastar políticas/metas documentales en Qdrant "
                "contra métricas cuantitativas exactas del CSV estructurado."
            ),
        )

    # 6. Datos estructurados CSV deterministas
    if has_structured:
        params = _extract_quarter_and_year(clean)
        return RouterDecision(
            choice="STRUCTURED_CSV",
            noul=nouls,
            score=0.95,
            box={"tools_allowed": ["consultar_ventas_estructuradas_tq"], **params},
            reasoning=(
                "Consulta cuantitativa/trimestral: enrutada a herramienta determinista "
                "Pydantic sobre CSV para garantizar aritmética exacta sin alucinaciones."
            ),
        )

    # 7. Seguimiento conversacional corto si hay historial previo sin palabras clave de RAG
    if has_history and len(clean.split()) <= 6 and not has_rag:
        return RouterDecision(
            choice="MEMORY_ONLY",
            noul=nouls,
            score=0.82,
            box={"tools_allowed": [], "use_short_term_checkpointer": True},
            reasoning=(
                "Seguimiento breve apoyado en memoria conversacional de corto plazo del hilo."
            ),
        )

    # 8. Por defecto para preguntas corporativas: RAG Documental Qdrant con blindaje
    return RouterDecision(
        choice="RAG_DOCUMENTAL",
        noul=nouls,
        score=0.91,
        box={"tools_allowed": ["buscar_corpus_documental_tq"], "top_k": 5, "mode": "hybrid"},
        reasoning=(
            "Consulta corporativa documental: enrutada al motor híbrido Qdrant (Densa + Léxica RRF) "
            "con cita verificable y blindaje contra inyección indirecta."
        ),
    )
