"""Configuración centralizada y tipada para Módulo 1 y Módulo 2 de Tecnoquímicas S.A."""

import os

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

    # Motor LLM (LangChain v1 init_chat_model: Gemini cloud prioritario + Ollama local soberano)
    llm_model: str = Field(default="llama3.2", alias="OLLAMA_MODEL")
    gemini_model: str = Field(default="gemini-3.8-flash", alias="GEMINI_MODEL")
    llm_provider: str = Field(default="ollama", alias="LLM_PROVIDER")
    ollama_base_url: str = Field(default="http://localhost:11434", alias="OLLAMA_BASE_URL")
    google_api_key: str | None = Field(default=None, alias="GOOGLE_API_KEY")

    @staticmethod
    def _clean_secret(candidate: str | None) -> str | None:
        """Limpia y descarta valores vacíos o placeholders en credenciales."""
        cleaned = (candidate or "").strip()
        if not cleaned:
            return None
        lowered = cleaned.lower()
        placeholders = (
            "tu_api",
            "your_",
            "pega_",
            "pegue_",
            "reemplaza",
            "placeholder",
            "changeme",
            "none",
            "null",
        )
        if any(token in lowered for token in placeholders):
            return None
        return cleaned

    def resolve_google_api_key(self) -> str | None:
        """Retorna la API Key de Google AI Studio desde entorno o `.env` si no es placeholder."""
        if "GOOGLE_API_KEY" in os.environ:
            candidate = os.environ["GOOGLE_API_KEY"]
        elif "GEMINI_API_KEY" in os.environ:
            candidate = os.environ["GEMINI_API_KEY"]
        else:
            candidate = self.google_api_key
        return self._clean_secret(candidate)

    def resolve_langsmith_api_key(self) -> str | None:
        """Retorna la API Key de LangSmith desde entorno o `.env` si no es placeholder."""
        if "LANGSMITH_API_KEY" in os.environ:
            candidate = os.environ["LANGSMITH_API_KEY"]
        elif "LANGCHAIN_API_KEY" in os.environ:
            candidate = os.environ["LANGCHAIN_API_KEY"]
        else:
            candidate = self.langsmith_api_key
        return self._clean_secret(candidate)

    def has_valid_google_key(self) -> bool:
        """Indica si existe una clave de Google AI Studio usable para Gemini."""
        return self.resolve_google_api_key() is not None

    def get_active_provider(self) -> str:
        """Prioriza Google Gemini si hay clave configurada; si no, usa Ollama local."""
        if self.has_valid_google_key():
            return "google_genai"
        if self.llm_provider in {"auto", "google_genai"}:
            return "ollama"
        return self.llm_provider

    def get_active_model(self) -> str:
        """Retorna el identificador del modelo activo según el proveedor seleccionado."""
        if self.get_active_provider() == "google_genai":
            return self.gemini_model
        return self.llm_model

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
    langsmith_endpoint: str = Field(
        default="https://api.smith.langchain.com",
        alias="LANGSMITH_ENDPOINT",
    )
    langsmith_api_key: str | None = Field(default=None, alias="LANGSMITH_API_KEY")
    langsmith_project: str = Field(
        default="tecnoquimicas-modulo2-agent",
        alias="LANGSMITH_PROJECT",
    )


config = TecnoquimicasConfig()
