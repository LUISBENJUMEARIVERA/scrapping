# ADR-0003: Memoria Dual Persistente (`SqliteSaver` + `PersistentMemoryStore`)

- **Fecha:** 2026-11-13
- **Estado:** Aceptada
- **Componentes:** `src/agent/memory.py`

## Contexto
Un chat ingenuo pierde la conversación al reiniciar el proceso o recargar el navegador (`F5`), y no transfiere hechos del usuario a hilos nuevos sin mezclar historiales.

## Decisión
Separar explícitamente dos niveles de memoria más control de ventana:
1. **Corto Plazo (`SqliteSaver`):** Persiste mensajes y checkpoints por `thread_id` en `data/memory/checkpoints.sqlite`, habilitando supervivencia ante reinicios y bifurcación **Time-Travel (`fork_thread_traces`)**.
2. **Control de Ventana (`trim_conversation_context`):** Recorta con `trim_messages` preservando `SystemMessage` y `start_on="human"` debajo del umbral de tokens.
3. **Largo Plazo (`PersistentMemoryStore`):** Implementa `BaseStore` con `namespace=("users", user_id, "profile")` y `search()` para recordar identidad y empresa en cualquier hilo nuevo.
