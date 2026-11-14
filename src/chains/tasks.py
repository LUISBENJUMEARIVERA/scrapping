import os
from collections.abc import Iterator

from langchain_core.output_parsers import StrOutputParser
from src.chains.prompts import FAQ_PROMPT, QA_PROMPT, SUMMARY_PROMPT
from src.core.config import config
from src.core.llm_factory import get_chat_model, get_llm


class KnowledgeService:
    """Servicio LCEL del Módulo 1 potenciado por el motor LLM híbrido (Gemini / Ollama)."""

    def __init__(self) -> None:
        self.context = self._load_context()
        self.llm = get_llm()

    def _load_context(self) -> str:
        if not os.path.exists(config.output_processed_file):
            return "No hay datos disponibles en la base de conocimiento."
        with open(config.output_processed_file, encoding="utf-8") as f:
            return f.read().strip()

    def _stream_with_fallback(self, prompt, inputs: dict[str, str]) -> Iterator[str]:
        """Ejecuta streaming LCEL con fallback automático a Ollama si Gemini falla en vuelo."""
        try:
            chain = prompt | self.llm | StrOutputParser()
            yield from chain.stream(inputs)
        except Exception:
            fallback_llm = get_chat_model(
                model=config.llm_model,
                provider="ollama",
                temperature=0.1,
            )
            fallback_chain = prompt | fallback_llm | StrOutputParser()
            yield from fallback_chain.stream(inputs)

    def get_summary_stream(self) -> Iterator[str]:
        return self._stream_with_fallback(SUMMARY_PROMPT, {"context": self.context})

    def get_faq_stream(self) -> Iterator[str]:
        return self._stream_with_fallback(FAQ_PROMPT, {"context": self.context})

    def answer_question_stream(self, question: str) -> Iterator[str]:
        return self._stream_with_fallback(
            QA_PROMPT,
            {"context": self.context, "question": question},
        )


# Instancia singleton para reutilizar
service = KnowledgeService()
