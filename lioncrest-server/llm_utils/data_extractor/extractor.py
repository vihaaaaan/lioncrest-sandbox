from __future__ import annotations

import os
from enum import Enum
from typing import Any, Dict, Optional, Tuple, Type

from pydantic import BaseModel, ValidationError
from llm_utils.data_extractor.schemas import Network, DealFlow, VCFund, LPMainDashboard
from llm_utils.llm_utils import LLMClient
import logging

logger = logging.getLogger(__name__)

class SchemaType(str, Enum):
    NETWORK = "network"
    DEAL_FLOW = "deal_flow"
    LP_MAIN_DASHBOARD = "lp_main_dashboard"
    VC_FUND = "vc_fund"


# Map schema types to Pydantic models
_DATA_MODEL_MAP: Dict[SchemaType, Type[BaseModel]] = {
    SchemaType.NETWORK: Network,
    SchemaType.DEAL_FLOW: DealFlow,
    SchemaType.LP_MAIN_DASHBOARD: LPMainDashboard,
    SchemaType.VC_FUND: VCFund,
}


_COMMON_RULES = """
Return ONLY a single JSON object for the schema. No explanation.

Global rules:
- Use exactly these field names (no extras). Missing/ambiguous -> null.
- Never invent values; prefer null over guessing.
- Keep human text as written (trim whitespace); do not summarize.
- Email: lowercase if clearly an email; else null.
- LinkedIn: include only full URLs; else null.
- Phone: prefer E.164 (+<country><area><number>) when unambiguous:
  * If a country code is present, normalize to E.164 (strip spaces/dashes/parentheses).
  * If country is explicitly stated and a valid local number appears, prepend the correct code.
  * Do NOT guess; if uncertain, keep digits as written or null if incomplete.
- Money amounts: keep original formatting (currency symbol, commas, ranges).
- Dates: convert to ISO 8601 UTC with milliseconds: YYYY-MM-DDTHH:MM:SS.mmmZ.
  * If only a date is given, use T00:00:00.000Z.
  * If a timezone is provided, convert to UTC.
  * If conflicting/ambiguous, set null.
""".strip()

# Optional per-schema clarifications/tie-breakers
_SCHEMA_NOTES: dict[SchemaType, str] = {
    SchemaType.NETWORK: (
    ),
    SchemaType.DEAL_FLOW: (
        "If multiple revenue numbers are present, choose the one explicitly marked as “run rate (in $k)”; otherwise null."
    ),
    SchemaType.LP_MAIN_DASHBOARD: (
        "“Sent Email?” must be “yes” or “no” only when explicitly stated; otherwise null. "
        "Status should reflect explicit wording; do not coerce."
    ),
    SchemaType.VC_FUND: (
        "Check Size must keep original currency/range formatting; do not normalize to numbers."
    ),
}

def _fields_block(schema_type: SchemaType) -> str:
    extra = _SCHEMA_NOTES.get(schema_type, "")
    extra_block = f"\n\nNotes:\n- {extra}" if extra else ""
    return (
        f"Extract the following fields for the {schema_type.value} schema. "
        "\n\n"
        f"{extra_block}\n\n{_COMMON_RULES}"
    )


def _prompt_for(schema_type: SchemaType, text: str) -> str:
    return f"""{_fields_block(schema_type)}

    Text:
    {text}
    """.strip()


class DataExtractor:
    """
    Uses OpenAI Responses API with Pydantic parsing:
      response = client.responses.parse(text_format=<PydanticModel>)
    Then validates & returns:
      - parsed_obj: the Pydantic instance
      - alias_dict: dict with board-ready alias keys (no None)
    """

    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm
        if not isinstance(llm, LLMClient):
            raise ValueError("llm must be an instance of LLMClient.")
        if not hasattr(llm, "parse") or not callable(getattr(llm, "parse")):
            raise ValueError("llm must implement .parse(...).")

    def _data_model_for(self, schema_type: SchemaType) -> Type[BaseModel]:
        try:
            return _DATA_MODEL_MAP[schema_type]
        except KeyError:
            raise ValueError(f"Unsupported schema_type: {schema_type}")

    def extract(
        self,
        schema_type: SchemaType,
        text: str,
        *,
        system_prompt: str = (
            "You are an expert at structured data extraction. "
            "Based on the provided schema, extract relevant information from the provided text."
        ),
    ) -> Tuple[BaseModel, Dict[str, Any]]:
        """
        Returns (parsed_obj, alias_dict)
          - parsed_obj: instance of the Pydantic schema
          - alias_dict: dict using alias keys (for Monday.com), excluding None
        """
        data_model = self._data_model_for(schema_type)
        user_prompt = _prompt_for(schema_type, text)

        resp = self.llm.parse(
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            text_format=data_model,
        )

        parsed_obj = getattr(resp, "output_parsed", None)
        if parsed_obj is None:
            raw = getattr(resp, "output_text", None)
            raise ValueError(f"LLM did not return a parseable object for {data_model.__name__}. Raw: {raw!r}")

        try:
            validated_obj = data_model.model_validate(parsed_obj.model_dump())
        except ValidationError as e:
            raise ValueError(f"Extraction did not match schema ({data_model.__name__}): {e}") from e

        alias_dict = validated_obj.model_dump(by_alias=True, exclude_none=True)

        return validated_obj, alias_dict
