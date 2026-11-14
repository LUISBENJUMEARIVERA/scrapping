"""Configuración centralizada y tipada para Módulo 1 y Módulo 2 de Tecnoquímicas S.A."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class TecnoquimicasConfig(BaseSettings):
    """Parámetros corporativos, rutas Medallion, Qdrant, Memoria Dual y LangSmith."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    empresa: str = "Tecnoquímicas S.A. (Grupo TQ)"
    seed_urls: list[str] = ["https://www.tqconfiable.com", "https://www.tqfarma.com"]
    allowed_domains: set[str] = {
        "tqconfiable.com",
        "www.tqconfiable.com",
        "tqfarma.com",
        "www.tqfarma.com",
    }
    ignored_extensions: set[str] = {
        ".pdf",
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".svg",
        ".mp4",
        ".mp3",
        ".zip",
        ".tar",
        ".gz",
        ".docx",
        ".xlsx",
        ".css",
        ".js",
    }
    max_pages: int = 25  # Límite óptimo para no saturar memoria en Módulo 1
    max_depth: int = 2
    user_agent: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 "
        "(compatible; TecnoquimicasBot/1.0; academic-eval)"
    )
    request_timeout_ms: int = 25000
    rate_limit_delay_ms: int = 1200

    # Capas de Almacenamiento (Medallion Architecture: Bronze -> Silver -> Gold)
    output_raw_dir: str = "data/raw"  # Bronze
    output_processed_file: str = "data/processed/knowledge_base.txt"  # Silver
    output_gold_dir: str = "data/gold"  # Gold
    output_gold_jsonl: str = "data/gold/corpus.jsonl"  # Gold
    output_gold_metrics: str = "data/gold/metrics.json"  # Gold Metrics

    # Motor LLM (LangChain v1 init_chat_model + Ollama local soberano)
    llm_model: str = Field(default="llama3.2", alias="OLLAMA_MODEL")
    llm_provider: str = Field(default="ollama", alias="LLM_PROVIDER")
    ollama_base_url: str = Field(default="http://localhost:11434", alias="OLLAMA_BASE_URL")

    # Módulo 2: Qdrant Vector Store + Memoria Dual + Datos Estructurados
    qdrant_path: str = Field(default="data/qdrant_db", alias="QDRANT_PATH")
    qdrant_collection: str = Field(default="tq_knowledge_m2", alias="QDRANT_COLLECTION")
    sqlite_checkpoint_path: str = Field(
        default="data/memory/checkpoints.sqlite",
        alias="SQLITE_CHECKPOINT_PATH",
    )
    long_term_store_path: str = Field(
        default="data/memory/long_term_store.json",
        alias="SQLITE_STORE_PATH",
    )
    structured_sales_csv: str = "data/gold/tq_ventas_trimestrales.csv"
    structured_portfolio_json: str = "data/gold/tq_portafolio_financiero.json"
    m2_eval_dataset_path: str = "data/evaluation/m2_retrieval_dataset.json"
    m2_eval_metrics_path: str = "data/evaluation/m2_retrieval_metrics.json"
    max_context_tokens: int = 3500

    # Observabilidad LangSmith
    langsmith_tracing: bool = Field(default=False, alias="LANGSMITH_TRACING")
    langsmith_project: str = Field(
        default="tecnoquimicas-modulo2-agent",
        alias="LANGSMITH_PROJECT",
    )


config = TecnoquimicasConfig()
