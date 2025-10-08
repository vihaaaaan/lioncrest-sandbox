# llm_utils/data_extractor/extractor.py
from __future__ import annotations

import time
from enum import Enum
from typing import Any, Dict, Tuple, Type, Optional

from pydantic import BaseModel, ValidationError

from llm_utils.schemas import deal_flow, network, vc_fund, lp
from llm_utils.llm_utils import LLMClient

from logging_config import get_logger, with_request_context 

logger = get_logger(__name__)


class SchemaType(str, Enum):
    NETWORK = "network"
    DEAL_FLOW = "deal_flow"
    LP_MAIN_DASHBOARD = "lp_main_dashboard"
    VC_FUND = "vc_fund"


# Map schema types to Pydantic models
_DATA_MODEL_MAP: Dict[SchemaType, Type[BaseModel]] = {
    SchemaType.NETWORK: network.Network,
    SchemaType.DEAL_FLOW: deal_flow.DealFlow,
    SchemaType.LP_MAIN_DASHBOARD: lp.LPMainDashboard,
    SchemaType.VC_FUND: vc_fund.VCFund,
}

_SYSTEM_PROMPT = """
You are a data-extraction assistant for a Venture Capital & Private Credit firm.
You receive unstructured text and MUST output data that satisfies a provided JSON Schema (derived from a Pydantic model).

Follow these rules STRICTLY and deterministically:

A) General
1) If a field clearly appears in the text, FILL IT. Only output null if the field is absent or truly unknowable.
2) Use the schema’s field ALIASES and TYPES exactly. Do not add fields. Do not change titles.
3) If a field expects an ENUM, choose ONLY from that enum. If no value clearly matches, output null.
4) If a field expects a LIST/ARRAY (e.g., “Referral Source”, “Sourced By”), ALWAYS return a JSON array when present (e.g., ["VC Fund"]). Never return a bare string.

B) Numeric normalization
5) For integer fields (e.g., “Revenue Run Rate”), expand abbreviations to full integers:
   - $4M → 4000000, $12M → 12000000, $500k → 500000
   - Strip symbols and text; output a pure integer or null if unknown.

C) Dates
6) Prefer ISO YYYY-MM-DD **only if** an exact date is parseable. Otherwise, copy the original date string verbatim (e.g., "Mon, Sep 15, 2025 at 9:32 AM"). If no date is present, use null.

D) Geographies (FULL STATE NAMES REQUIRED)
7) When the text provides a U.S. location like "City, ST" (postal code), you MUST convert the 2-letter code to the FULL state name from the mapping below and place it in the “State” field. This is a deterministic conversion, not inference.
8) If a full name is already given, keep it as-is (but ensure it matches the enum spelling).
9) If the location is outside the U.S. or cannot be mapped, set “State” = null.

US STATE CODE → FULL NAME (authoritative mapping):
AL→Alabama, AK→Alaska, AZ→Arizona, AR→Arkansas, CA→California, CO→Colorado, CT→Connecticut, DE→Delaware, FL→Florida, GA→Georgia, HI→Hawaii, ID→Idaho, IL→Illinois, IN→Indiana, IA→Iowa, KS→Kansas, KY→Kentucky, LA→Louisiana, ME→Maine, MD→Maryland, MA→Massachusetts, MI→Michigan, MN→Minnesota, MS→Mississippi, MO→Missouri, MT→Montana, NE→Nebraska, NV→Nevada, NH→New Hampshire, NJ→New Jersey, NM→New Mexico, NY→New York, NC→North Carolina, ND→North Dakota, OH→Ohio, OK→Oklahoma, OR→Oregon, PA→Pennsylvania, RI→Rhode Island, SC→South Carolina, SD→South Dakota, TN→Tennessee, TX→Texas, UT→Utah, VT→Vermont, VA→Virginia, WA→Washington, WV→West Virginia, WI→Wisconsin, WY→Wyoming, DC→Washington D.C.

E) Emails/URLs and Notes
10) Keep emails/URLs exact and unmodified.
11) “Notes” should be concise and factual; summarize key context without marketing language.

F) Ambiguity policy
12) Do NOT fabricate. When the text is ambiguous and no deterministic rule applies, output null for that field.
13) However, DO perform the deterministic transformations above (e.g., “Austin, TX” → State: “Texas”; Referral Source string → array).

Output MUST validate against the provided JSON Schema (additionalProperties=false; strict).
""".strip()


def _fields_block(schema_type: SchemaType) -> str:
    """List field aliases + descriptions so the model knows exactly what to fill."""
    model = _DATA_MODEL_MAP[schema_type]
    lines = []
    for name, field in model.model_fields.items():
        alias = field.alias or name
        desc = (field.description or "").strip()
        if desc:
            lines.append(f"- {alias}: {desc}")
        else:
            lines.append(f"- {alias}")
    return f"Extract the following fields for the {schema_type.value} schema:\n" + "\n".join(lines)


def _prompt_for(schema_type: SchemaType, text: str) -> str:
    """User message: schema field list + the raw text."""
    return f"""{_fields_block(schema_type)}

Text:
{text}
""".strip()


class DataExtractor:
    """
    Uses an LLM client that supports structured parse:
      response = client.parse(text_format=<PydanticModel>)
    Then validates & returns:
      - parsed_obj: the Pydantic instance
      - alias_dict: dict with board-ready alias keys
    """

    def __init__(self, llm: LLMClient) -> None:
        if not isinstance(llm, LLMClient):
            raise ValueError("llm must be an instance of LLMClient.")
        if not hasattr(llm, "parse") or not callable(getattr(llm, "parse")):
            raise ValueError("llm must implement .parse(...).")
        self.llm = llm
        logger.debug("DataExtractor initialized with LLMClient")

    def _data_model_for(self, schema_type: SchemaType) -> Type[BaseModel]:
        try:
            return _DATA_MODEL_MAP[schema_type]
        except KeyError:
            logger.warning(f"unsupported schema_type requested: {schema_type}")
            raise ValueError(f"Unsupported schema_type: {schema_type}")

    def extract(
        self,
        *,
        schema_type: SchemaType,
        text: str,
        system_prompt: str = _SYSTEM_PROMPT,
        log_extra: Optional[Dict[str, Any]] = None,
    ) -> Tuple[BaseModel, Dict[str, Any]]:
        """
        Returns (parsed_obj, alias_dict)
          - parsed_obj: instance of the Pydantic schema
          - alias_dict: dict using alias keys (for Monday.com)

        Parameters
        ----------
        schema_type : SchemaType
            Which schema to extract.
        text : str
            Input text (not logged for privacy; only length is logged).
        system_prompt : str
            System prompt used to guide extraction.
        log_extra : dict | None
            Optional structured logging context (e.g., with_request_context(...)).
        """
        total_start = time.perf_counter()

        data_model = self._data_model_for(schema_type)
        text_len = len(text or "")
        logger.info(
            "extraction started",
            extra={**(log_extra or {}), "schema_type": schema_type.value, "text_len": text_len},
        )

        user_prompt = _prompt_for(schema_type, text)

        # Call LLM and measure latency
        llm_start = time.perf_counter()
        try:
            resp = self.llm.parse(
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                text_format=data_model,
            )
        except Exception:
            # Full traceback will be included by the root logger
            logger.exception(
                "llm.parse raised an exception",
                extra={**(log_extra or {}), "schema_type": schema_type.value},
            )
            raise
        llm_ms = int((time.perf_counter() - llm_start) * 1000)

        parsed_obj = getattr(resp, "output_parsed", None)
        logger.data(f"parsed_obj: {parsed_obj!r}", extra={**(log_extra or {}), "llm_ms": llm_ms})
        if parsed_obj is None:
            raw = getattr(resp, "output_text", None)
            logger.error(
                "llm returned no parseable object",
                extra={**(log_extra or {}), "schema_type": schema_type.value, "llm_ms": llm_ms},
            )
            raise ValueError(
                f"LLM did not return a parseable object for {data_model.__name__}. Raw: {raw!r}"
            )

        # Validate against the schema
        try:
            validated_obj = data_model.model_validate(parsed_obj.model_dump(by_alias=True))
            logger.data(f"validated_obj: {validated_obj!r}", extra={**(log_extra or {}), "llm_ms": llm_ms})
        except ValidationError as e:
            logger.warning(
                "schema validation failed",
                extra={
                    **(log_extra or {}),
                    "schema_type": schema_type.value,
                    "llm_ms": llm_ms,
                    "error": "ValidationError",
                },
            )
            raise ValueError(f"Extraction did not match schema ({data_model.__name__}): {e}") from e

        alias_dict = validated_obj.model_dump(by_alias=True, exclude_none=False)

        total_ms = int((time.perf_counter() - total_start) * 1000)
        logger.info(
            "extraction succeeded",
            extra={
                **(log_extra or {}),
                "schema_type": schema_type.value,
                "llm_ms": llm_ms,
                "total_ms": total_ms,
            },
        )

        return validated_obj, alias_dict
