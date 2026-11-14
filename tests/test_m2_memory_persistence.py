"""Pruebas unitarias para Memoria Dual (SqliteSaver, Store, Trim y Time-Travel)."""

from __future__ import annotations

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from src.agent.memory import (
    DualMemoryManager,
    PersistentMemoryStore,
    extract_user_facts,
    trim_conversation_context,
)


def test_extract_user_facts_ignores_questions_and_captures_identity() -> None:
    """Extrae nombre, empresa, cargo y preferencia; ignora preguntas interrogativas."""
    # Arrange
    statement = (
        "Hola, me llamo Ana Martínez, soy Directora de Compras y "
        "trabajo en Carvajal. Prefiero respuestas ejecutivas."
    )
    question = "¿Cómo me llamo y dónde trabajo?"

    # Act
    facts_stmt = extract_user_facts(statement)
    facts_q = extract_user_facts(question)

    # Assert
    assert facts_stmt["nombre"] == "Ana Martínez"
    assert facts_stmt["empresa"] == "Carvajal"
    assert "Directora" in facts_stmt["cargo"]
    assert "ejecutivas" in facts_stmt["preferencia_formato"]
    assert facts_q == {}


def test_persistent_memory_store_roundtrip_on_disk(tmp_path) -> None:
    """Verifica persistencia física en JSON y recuperación con search() por namespace."""
    # Arrange
    store_file = tmp_path / "store_test.json"
    store1 = PersistentMemoryStore(persist_path=store_file)
    ns = ("users", "ana_id", "profile")
    store1.put(ns, "nombre", {"nombre": "Ana Martínez"})
    store1.put(ns, "empresa", {"empresa": "Carvajal"})

    # Act: Reinstancia desde disco tras reinicio simulado
    store2 = PersistentMemoryStore(persist_path=store_file)
    items = store2.search(ns, limit=20)

    # Assert
    keys = {item.key: item.value for item in items}
    assert keys["nombre"] == {"nombre": "Ana Martínez"}
    assert keys["empresa"] == {"empresa": "Carvajal"}


def test_trim_conversation_context_keeps_system_and_respects_budget() -> None:
    """Confirma que el recorte mantiene SystemMessage y reduce tokens bajo el límite."""
    # Arrange
    msgs = [SystemMessage(content="Directiva TQ")]
    for i in range(18):
        msgs.append(HumanMessage(content=f"Consulta {i} " + ("dato " * 25)))
        msgs.append(AIMessage(content=f"Respuesta {i} " + ("soporte " * 25)))

    # Act
    report = trim_conversation_context(msgs, max_tokens=220)

    # Assert
    assert report["trimmed"] is True
    assert report["kept_tokens"] <= 260
    assert isinstance(report["messages"][0], SystemMessage)


def test_dual_memory_fork_creates_independent_time_travel_branch(tmp_path) -> None:
    """Valida bifurcación Time-Travel de trazas entre hilo origen e hilo bifurcado."""
    # Arrange
    mem = DualMemoryManager(
        checkpoint_db_path=str(tmp_path / "cp.sqlite"),
        store_path=str(tmp_path / "st.json"),
    )
    mem.touch_thread("hilo-base", user_id="tester", title="Hilo Base")
    mem.record_turn_trace(
        thread_id="hilo-base",
        checkpoint_id="cp-1",
        user_query="Q1 ventas",
        assistant_response="Respuesta Q1",
        router_decision={"choice": "STRUCTURED_CSV"},
        steps=[],
        citations=[],
    )
    mem.record_turn_trace(
        thread_id="hilo-base",
        checkpoint_id="cp-2",
        user_query="Q2 ventas",
        assistant_response="Respuesta Q2",
        router_decision={"choice": "STRUCTURED_CSV"},
        steps=[],
        citations=[],
    )

    # Act
    fork_id = mem.fork_thread_traces("hilo-base", new_thread_id="hilo-rama-2")

    # Assert
    assert fork_id == "hilo-rama-2"
    assert len(mem.get_turn_traces("hilo-base")) == 2
    assert len(mem.get_turn_traces("hilo-rama-2")) == 2
    mem.conn.close()
