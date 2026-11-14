# Banco de Respuestas Técnicas para Preguntas del Docente (`12:00 – 15:00`)

1. **¿Por qué desacoplaron React + FastAPI SSE en lugar de usar Streamlit?**  
   *Streamlit re-ejecuta el script completo en cada interacción, bloquea la sesión con spinners ante pasos multi-herramienta y dificulta el streaming granular ReAct y las pausas HITL con `Command(resume=...)`. React + SSE permite eventos independientes (`memory`, `router`, `thought`, `action`, `observation`, `interrupt`, `token`) y persistencia durable en SQLite ante recargas `F5`.*

2. **¿Cómo diferencian la memoria de corto plazo de la de largo plazo?**  
   *Corto plazo usa `SqliteSaver` indexado por `thread_id` (`checkpoints.sqlite`) para conservar los turnos de un hilo específico tras reiniciar FastAPI e incluso bifurcar estados con Time-Travel. Largo plazo usa `PersistentMemoryStore` (`BaseStore`) con `namespace=("users", user_id, "profile")` y `search()`, permitiendo recuperar nombre, empresa y preferencias en hilos totalmente nuevos.*

3. **¿Por qué elegir LangGraph frente a LlamaIndex Workflows, DSPy o Agno?**  
   *LangGraph ofrece control explícito de ciclos y estados en `StateGraph`, soporte nativo de `SqliteSaver` + `BaseStore` + `interrupt()` para HITL y trazas nativas en LangSmith. LlamaIndex destaca más en ETL documental y DSPy es complementario para optimizar prompts.*

4. **¿Qué ventaja tuvo Qdrant Híbrido (Dense + Sparse BM25 con RRF) frente a búsqueda puramente densa?**  
   *En nuestro benchmark de 25 consultas etiquetadas, la búsqueda densa sola logró `Recall@10 = 0.96` y `MRR = 0.813`, mientras que la fusión híbrida RRF alcanzó **`Recall@10 = 1.00` y `MRR = 0.880`** al capturar tanto contexto semántico como acrónimos exactos (`BPM`, `INVIMA`, `Villa Rica`).*

5. **¿Cómo garantizan que el agente no invente cifras de ventas ni obedezca un prompt injection en el corpus?**  
   *Las cifras numéricas pasan obligatoriamente por la herramienta `@tool consultar_ventas_estructuradas_tq` validada con Pydantic v2, que ejecuta la aritmética exacta en Python sobre `tq_ventas_trimestrales.csv`. Para documentos, `rag_shield.py` detecta directivas sospechosas, las neutraliza y confina cada fragmento dentro de `<contexto_documental_pasivo politica="SOLO_DATOS_NO_EJECUTABLES">`.*
