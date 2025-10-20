# llm_utils/data_extractor/extractor.py
from __future__ import annotations

import time
from enum import Enum
from typing import Any, Dict, Tuple, Type, Optional
from pydantic import create_model

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
    
    @property
    def display_name(self) -> str:
        """Return user-friendly display name for the schema type."""
        display_names = {
            "network": "Network",
            "deal_flow": "Deal Flow", 
            "lp_main_dashboard": "LP Main Dashboard",
            "vc_fund": "VC Fund"
        }
        return display_names.get(self.value, self.value.replace("_", " ").title())


# Map schema types to Pydantic models
_DATA_MODEL_MAP: Dict[SchemaType, Type[BaseModel]] = {
    SchemaType.NETWORK: network.Network,
    SchemaType.DEAL_FLOW: deal_flow.DealFlow,
    SchemaType.LP_MAIN_DASHBOARD: lp.LPMainDashboard,
    SchemaType.VC_FUND: vc_fund.VCFund,
}

_SYSTEM_PROMPT = """
You are a data-processing assistant for a Venture Capital & Private Credit firm.

You receive unstructured text and MUST output data that satisfies a provided JSON Schema (derived from a Pydantic model).

Follow these rules STRICTLY and deterministically:

A) General
1) If a field clearly appears in the text, FILL IT. Only output null if the field is absent or truly unknowable.
2) Use the schema's field ALIASES and TYPES exactly. Do not add fields. Do not change titles.
3) If a field expects an ENUM, choose ONLY from that enum. If no value clearly matches, output null.
4) If a field expects a LIST/ARRAY (e.g., "Referral Source", "Sourced By"), ALWAYS return a JSON array when present (e.g., ["VC Fund"]). Never return a bare string.

B) Numeric normalization
5) For integer fields (e.g., "Revenue Run Rate"), expand abbreviations to full integers:
   - $4M → 4000000, $12M → 12000000, $500k → 500000
   - Strip symbols and text; output a pure integer or null if unknown.

C) Dates
6) Prefer ISO YYYY-MM-DD **only if** an exact date is parseable. Otherwise, copy the original date string verbatim (e.g., "Mon, Sep 15, 2025 at 9:32 AM"). If no date is present, use null.

D) Geographies (FULL STATE NAMES REQUIRED)
7) When the text provides a U.S. location like "City, ST" (postal code), you MUST convert the 2-letter code to the FULL state name from the mapping below and place it in the "State" field. This is a deterministic conversion, not inference.
8) If a full name is already given, keep it as-is (but ensure it matches the enum spelling).
9) If the location is outside the U.S. or cannot be mapped, set "State" = null.

US STATE CODE → FULL NAME (authoritative mapping):
AL→Alabama, AK→Alaska, AZ→Arizona, AR→Arkansas, CA→California, CO→Colorado, CT→Connecticut, DE→Delaware, FL→Florida, GA→Georgia, HI→Hawaii, ID→Idaho, IL→Illinois, IN→Indiana, IA→Iowa, KS→Kansas, KY→Kentucky, LA→Louisiana, ME→Maine, MD→Maryland, MA→Massachusetts, MI→Michigan, MN→Minnesota, MS→Mississippi, MO→Missouri, MT→Montana, NE→Nebraska, NV→Nevada, NH→New Hampshire, NJ→New Jersey, NM→New Mexico, NY→New York, NC→North Carolina, ND→North Dakota, OH→Ohio, OK→Oklahoma, OR→Oregon, PA→Pennsylvania, RI→Rhode Island, SC→South Carolina, SD→South Dakota, TN→Tennessee, TX→Texas, UT→Utah, VT→Vermont, VA→Virginia, WA→Washington, WV→West Virginia, WI→Wisconsin, WY→Wyoming, DC→Washington D.C.

E) Emails/URLs and Notes
10) Keep emails/URLs exact and unmodified.
11) "Notes" should be concise and factual; summarize key context without marketing language.

F) Ambiguity policy
12) Do NOT fabricate. When the text is ambiguous and no deterministic rule applies, output null for that field.
13) However, DO perform the deterministic transformations above (e.g., "Austin, TX" → State: "Texas"; Referral Source string → array).

Output MUST validate against the provided JSON Schema (additionalProperties=false; strict).
""".strip()

_UPDATE_SYSTEM_PROMPT = """
You are a data-processing assistant for a Venture Capital & Private Credit firm.

You are UPDATING an existing record with new information from unstructured text. An existing record with current field values is provided below.

CRITICAL UPDATE RULES:

A) Existing Data Preservation
1) ONLY update a field if the new text contains CLEAR, RELEVANT information that changes or enriches that field.
2) If a field's current value is already correct and the new text doesn't contradict or add to it, KEEP the existing value.
3) DO NOT replace existing data with null unless the new text explicitly indicates the field should be cleared.
4) For fields not mentioned in the new text, PRESERVE the existing values.

B) Update Behavior by Field Type
5) For TEXT fields: Only update if new text provides more detail, corrections, or materially different information.
6) For ENUM fields: Only update if new text explicitly indicates a different category. Preserve existing selection if new text is ambiguous.
7) For NUMERIC fields: Only update if new text provides a different number. Apply same normalization rules ($4M → 4000000).
8) For DATE fields: Only update if new text provides a more accurate or different date.
9) For LIST/ARRAY fields: APPEND new items if they add value; don't remove existing items unless contradicted.
10) For NOTES: APPEND new information to existing notes rather than replacing, unless new text supersedes old context.

C) General Rules (same as initial extraction)
11) Use the schema's field ALIASES and TYPES exactly.
12) For ENUM fields, choose ONLY from the enum values.
13) For geographic fields, convert state codes to full names (TX → Texas).
14) Keep emails/URLs exact and unmodified.
15) Do NOT fabricate. If ambiguous, preserve existing value.

D) Conflict Resolution
16) If new text CONTRADICTS existing data, prefer the new text (assume it's more recent/accurate).
17) If new text ENRICHES existing data (adds detail without contradicting), merge/append the information.

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


def _update_prompt_for(schema_type: SchemaType, text: str, existing_data: Dict[str, Any]) -> str:
    """User message for updating existing record: includes current values + new text."""
    import json
    
    return f"""{_fields_block(schema_type)}

EXISTING RECORD (Current Values):
{json.dumps(existing_data, indent=2)}

NEW TEXT TO PROCESS:
{text}

Instructions: Update the record by merging the existing values with any NEW, RELEVANT information from the text above. Only change fields that are clearly updated or enriched by the new text.
""".strip()


def _normalize_existing_data(schema_type: SchemaType, existing_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize field names from Monday.com to match schema aliases exactly.
    
    Monday.com may return field names with suffixes like "(in $k)" that don't match
    the schema aliases. This function maps Monday field names to the correct schema aliases.
    
    Args:
        schema_type: The schema type
        existing_data: Raw data from Monday.com with potentially mismatched field names
        
    Returns:
        Normalized dict with field names matching schema aliases exactly
    """
    model = _DATA_MODEL_MAP[schema_type]
    normalized = {}
    
    # Create a mapping of normalized field names to schema aliases
    # This handles cases like "Revenue Run Rate (in $k)" -> "Revenue Run Rate"
    alias_map = {}
    for field_name, field_info in model.model_fields.items():
        alias = field_info.alias or field_name
        # Store both the exact alias and a normalized version (lowercase, no special chars)
        alias_map[alias.lower().strip()] = alias
        # Also map without parenthetical suffixes
        base_alias = alias.split('(')[0].strip()
        if base_alias.lower() != alias.lower():
            alias_map[base_alias.lower()] = alias
    
    # Map existing data to correct aliases
    for key, value in existing_data.items():
        # Try exact match first
        if key in [field_info.alias or fname for fname, field_info in model.model_fields.items()]:
            normalized[key] = value
            continue
            
        # Try normalized match
        normalized_key = key.lower().strip()
        if normalized_key in alias_map:
            normalized[alias_map[normalized_key]] = value
            continue
            
        # Try without parenthetical suffix
        base_key = key.split('(')[0].strip().lower()
        if base_key in alias_map:
            normalized[alias_map[base_key]] = value
            continue
            
        # If no match found, keep original key (might be a custom field)
        normalized[key] = value
    
    return normalized


def _compare_records(old_data: Dict[str, Any], new_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compare old and new data to identify which fields were updated.
    
    Returns a dict with metadata about changes:
    {
        "updated_fields": ["field1", "field2"],
        "added_fields": ["field3"],
        "unchanged_fields": ["field4", "field5"],
        "changes": {
            "field1": {"old": "value1", "new": "value2"},
            "field2": {"old": null, "new": "value3"}
        }
    }
    """
    updated_fields = []
    added_fields = []
    unchanged_fields = []
    changes = {}
    
    # Check all fields in new data
    all_keys = set(old_data.keys()) | set(new_data.keys())
    
    for key in all_keys:
        old_val = old_data.get(key)
        new_val = new_data.get(key)
        
        # Field was added (didn't exist before)
        if key not in old_data:
            added_fields.append(key)
            changes[key] = {"old": None, "new": new_val}
        # Field was updated (value changed)
        elif old_val != new_val:
            updated_fields.append(key)
            changes[key] = {"old": old_val, "new": new_val}
        # Field unchanged
        else:
            unchanged_fields.append(key)
    
    return {
        "updated_fields": updated_fields,
        "added_fields": added_fields,
        "unchanged_fields": unchanged_fields,
        "changes": changes,
        "total_changes": len(updated_fields) + len(added_fields)
    }


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
        
    def extract_entity_name_only(self, schema_type: SchemaType, text: str) -> str:
        """Extract only the entity name from the text."""
        total_start = time.perf_counter()
        data_model = self._data_model_for(schema_type)

        target_field = None
        for fname, field in data_model.model_fields.items():
            alias = field.alias or fname
            if "name" == alias.lower() or alias.lower().endswith("name"):
                target_field = (fname, field)
                break
        if not target_field:
            raise ValueError(f"No name field found in schema: {data_model.__name__}")

        fname, field = target_field

        NameOnlyModel = create_model(
            f"{data_model.__name__}NameOnly",
            **{fname: (field.annotation, field)}
        )

        system_prompt = "Extract only the entity name. Return null if unknown."
        user_prompt = f"Extract the field '{field.alias or fname}' from the following text:\n\n{text}"

        try:
            resp = self.llm.parse(
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                text_format=NameOnlyModel,
            )
            parsed = getattr(resp, "output_parsed", None)
            if not parsed:
                return None

            # Get the actual name value (handle alias correctly)
            name_value = getattr(parsed, fname, None)
            if name_value is None:
                name_value = parsed.model_dump(by_alias=True).get(field.alias or fname)
            return name_value

        except Exception:
            logger.exception(
                "Failed to extract entity name only",
                extra={"schema_type": schema_type.value}
            )
            return None

        finally:
            total_ms = int((time.perf_counter() - total_start) * 1000)
            logger.info(
                "name extraction completed",
                extra={"schema_type": schema_type.value, "total_ms": total_ms},
            )

    def extract_entity_email_only(self, schema_type: SchemaType, text: str) -> Optional[str]:
        """
        Extract only the email address from the text.
        Useful for looking up existing records by email (e.g., Network, LP schemas).
        
        Args:
            schema_type: The schema type to extract from
            text: The text to extract email from
            
        Returns:
            The extracted email address or None if not found
        """
        total_start = time.perf_counter()
        data_model = self._data_model_for(schema_type)

        # Find the email field in the schema
        target_field = None
        for fname, field in data_model.model_fields.items():
            alias = field.alias or fname
            if "email" in alias.lower():
                target_field = (fname, field)
                break
        
        if not target_field:
            logger.warning(
                f"No email field found in schema: {data_model.__name__}",
                extra={"schema_type": schema_type.value}
            )
            return None

        fname, field = target_field

        # Create a minimal model with just the email field
        EmailOnlyModel = create_model(
            f"{data_model.__name__}EmailOnly",
            **{fname: (field.annotation, field)}
        )

        system_prompt = "Extract only the email address. Return null if unknown or not present."
        user_prompt = f"Extract the field '{field.alias or fname}' from the following text:\n\n{text}"

        try:
            resp = self.llm.parse(
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                text_format=EmailOnlyModel,
            )
            parsed = getattr(resp, "output_parsed", None)
            if not parsed:
                return None

            # Get the actual email value (handle alias correctly)
            email_value = getattr(parsed, fname, None)
            if email_value is None:
                email_value = parsed.model_dump(by_alias=True).get(field.alias or fname)
            
            return email_value

        except Exception:
            logger.exception(
                "Failed to extract email only",
                extra={"schema_type": schema_type.value}
            )
            return None

        finally:
            total_ms = int((time.perf_counter() - total_start) * 1000)
            logger.info(
                "email extraction completed",
                extra={"schema_type": schema_type.value, "total_ms": total_ms},
            )

    def extract_with_update(
        self,
        *,
        schema_type: SchemaType,
        text: str,
        existing_data: Dict[str, Any],
        log_extra: Optional[Dict[str, Any]] = None,
    ) -> Tuple[BaseModel, Dict[str, Any], Dict[str, Any]]:
        """
        Extract and UPDATE an existing record with new information.
        
        Returns (parsed_obj, alias_dict, metadata)
          - parsed_obj: instance of the Pydantic schema
          - alias_dict: dict using alias keys (for Monday.com)
          - metadata: dict with change tracking info
        
        Parameters
        ----------
        schema_type : SchemaType
            Which schema to extract.
        text : str
            New input text to process.
        existing_data : Dict[str, Any]
            Current field values from Monday.com (with alias keys).
        log_extra : dict | None
            Optional structured logging context.
        """
        total_start = time.perf_counter()

        data_model = self._data_model_for(schema_type)
        text_len = len(text or "")
        logger.info(
            "update extraction started",
            extra={**(log_extra or {}), "schema_type": schema_type.value, "text_len": text_len},
        )

        # Normalize existing data field names to match schema aliases
        # This handles cases where Monday.com returns "Revenue Run Rate (in $k)" 
        # but schema has "Revenue Run Rate"
        normalized_existing_data = _normalize_existing_data(schema_type, existing_data)
        logger.debug(
            "normalized existing data",
            extra={
                **(log_extra or {}),
                "original_keys": list(existing_data.keys()),
                "normalized_keys": list(normalized_existing_data.keys())
            }
        )

        # Use the UPDATE prompt with normalized existing data context
        user_prompt = _update_prompt_for(schema_type, text, normalized_existing_data)

        # Call LLM with UPDATE system prompt
        llm_start = time.perf_counter()
        try:
            resp = self.llm.parse(
                input=[
                    {"role": "system", "content": _UPDATE_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                text_format=data_model,
            )
        except Exception:
            logger.exception(
                "llm.parse raised an exception during update",
                extra={**(log_extra or {}), "schema_type": schema_type.value},
            )
            raise
        llm_ms = int((time.perf_counter() - llm_start) * 1000)

        parsed_obj = getattr(resp, "output_parsed", None)
        logger.data(f"parsed_obj (update): {parsed_obj!r}", extra={**(log_extra or {}), "llm_ms": llm_ms})
        
        if parsed_obj is None:
            raw = getattr(resp, "output_text", None)
            logger.error(
                "llm returned no parseable object during update",
                extra={**(log_extra or {}), "schema_type": schema_type.value, "llm_ms": llm_ms},
            )
            raise ValueError(
                f"LLM did not return a parseable object for {data_model.__name__}. Raw: {raw!r}"
            )

        # Validate against the schema
        try:
            validated_obj = data_model.model_validate(parsed_obj.model_dump(by_alias=True))
            logger.data(f"validated_obj (update): {validated_obj!r}", extra={**(log_extra or {}), "llm_ms": llm_ms})
        except ValidationError as e:
            logger.warning(
                "schema validation failed during update",
                extra={
                    **(log_extra or {}),
                    "schema_type": schema_type.value,
                    "llm_ms": llm_ms,
                    "error": "ValidationError",
                },
            )
            raise ValueError(f"Update extraction did not match schema ({data_model.__name__}): {e}") from e

        alias_dict = validated_obj.model_dump(by_alias=True, exclude_none=False)

        # Compare old vs new to track changes (use normalized data for accurate comparison)
        change_metadata = _compare_records(normalized_existing_data, alias_dict)
        
        total_ms = int((time.perf_counter() - total_start) * 1000)
        logger.info(
            "update extraction succeeded",
            extra={
                **(log_extra or {}),
                "schema_type": schema_type.value,
                "llm_ms": llm_ms,
                "total_ms": total_ms,
                "total_changes": change_metadata["total_changes"],
                "updated_fields": change_metadata["updated_fields"],
            },
        )

        return validated_obj, alias_dict, change_metadata

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
