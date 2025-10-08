from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from dotenv import load_dotenv
import os
from openai import OpenAI

load_dotenv()

class LLMClient(ABC):
    """
    Provider-agnostic interface. Subclasses must expose:
      - .model : str
      - .parse(input: list[dict], text_format: type[BaseModel], **kwargs) -> Any
      - .chat(messages: list[dict], **kwargs) -> Any   (optional for your extractor, but kept for symmetry)
    """

    @property
    @abstractmethod
    def model(self) -> str:  # instance-level model
        ...

    @abstractmethod
    def parse(self, input: List[Dict[str, Any]], *, text_format: Any, **kwargs) -> Any:
        """Structured parse call (OpenAI Responses, Anthropic tool schema, etc.)."""
        ...

    # @abstractmethod
    # def chat(self, messages: List[Dict[str, Any]], **kwargs) -> Any:
    #     """Free-form chat call for ad-hoc use."""
    #     ...


class OpenAIClient(LLMClient):
    def __init__(self, model: str = "gpt-4o-2024-08-06") -> None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not found in environment variables.")
        self._client = OpenAI(api_key=api_key)
        self._model = model

    @property
    def model(self) -> str:
        return self._model

    def parse(self, input: List[Dict[str, Any]], *, text_format: Any, **kwargs,) -> Any:
        # OpenAI Responses API: use `input=...` and `text_format=...`
        return self._client.responses.parse(
            model=self._model,
            input=input,
            text_format=text_format,
            temperature=0.0,
            **kwargs,
        )

    # def chat(self, messages: List[Dict[str, Any]], *,
    #     temperature: float = 0.0,
    #     **kwargs,
    # ):
    #     # Option 1: classic Chat Completions
    #     return self._client.chat.completions.create(
    #         model=self._model,
    #         messages=messages,
    #         temperature=temperature,
    #         **kwargs,
    #     )
    #     # Option 2 (if you prefer Responses for everything):
    #     # return self._client.responses.create(model=self._model, input=messages, temperature=temperature, **kwargs)
