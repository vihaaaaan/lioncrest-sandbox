import os
import requests
from textwrap import dedent

from functools import lru_cache
from typing import Dict, List, Optional, TypedDict
from llm_utils.data_extractor.extractor import SchemaType

from logging_config import get_logger
logger = get_logger(__name__)

MONDAY_API_URL = "https://api.monday.com/v2"
API_KEY = os.getenv("MONDAY_COM_API_KEY") 

SCHEMA_BOARD_ID_MAP = {
    SchemaType.DEAL_FLOW: 9206286550,
    SchemaType.LP_MAIN_DASHBOARD: 9511257597,
    SchemaType.VC_FUND: 551869329,
    SchemaType.NETWORK: 1028643789,
}


HEADERS = {
    "Authorization": API_KEY,
    "Content-Type": "application/json"
}

class ItemRecord(TypedDict):
    id: str
    name: str
    columns: Dict[str, Optional[str]]  # {"Email": "a@b.com", "State": "Ohio", ...}

class RawItemRecord(TypedDict):
    id: str
    name: str
    column_values: List[Dict[str, Optional[str]]]

# ---------- GraphQL snippets ----------

Q_COLUMNS = """
query ($board_id: [ID!]) {
  boards(ids: $board_id) {
    id
    columns { id title }
  }
}
"""

Q_BY_NAME = """
query ($board_id: ID!, $name: String!) {
  items_page_by_column_values(
    board_id: $board_id
    columns: [{ column_id: "name", column_values: [$name] }]
    limit: 25
  ) {
    items {
      id
      name
      column_values { id text type }
    }
  }
}
"""

Q_BY_COLUMN = """
query ($board_id: ID!, $column_id: String!, $value: String!) {
  items_page_by_column_values(
    board_id: $board_id
    columns: [{ column_id: $column_id, column_values: [$value] }]
    limit: 25
  ) {
    items {
      id
      name
      column_values { id text type }
    }
  }
}
"""

M_CREATE_ITEM = """
mutation ($board_id: ID!, $item_name: String!, $column_values: JSON!) {
  create_item(
    board_id: $board_id
    item_name: $item_name
    column_values: $column_values
  ) {
    id
    name
  }
}
"""

M_UPDATE_ITEM = """
mutation ($board_id: ID!, $item_id: ID!, $column_values: JSON!) {
  change_multiple_column_values(
    board_id: $board_id
    item_id: $item_id
    column_values: $column_values
  ) {
    id
    name
  }
}
"""

def _find_email_column_id(board_id: int) -> Optional[str]:
    """
    Returns the column_id of the first column whose title includes 'email' (case-insensitive).
    """
    title_map = get_column_title_map(board_id)  # {id: title}
    for col_id, title in title_map.items():
        if "email" in title.lower():
            return col_id
    return None


def get_items_by_email(board_id: int, email: str, map_titles: bool = True) -> List[ItemRecord | RawItemRecord]:
    """
    Look up items by email address dynamically (auto-detects the correct email column).
    """
    email_col_id = _find_email_column_id(board_id)
    if not email_col_id:
        raise ValueError(f"No 'Email' column found on board {board_id}")

    data = execute_query(Q_BY_COLUMN, {"board_id": board_id, "column_id": email_col_id, "value": email})
    _assert_no_errors(data)

    items: List[RawItemRecord] = (
        data.get("data", {})
            .get("items_page_by_column_values", {})
            .get("items", [])
    )

    if not map_titles:
        return items

    title_map = get_column_title_map(board_id)
    return [_map_columns_by_title(it, title_map) for it in items]

# ---------- Helpers ----------

def flatten_item(item: dict) -> dict:
    """
    Flattens a single item returned by get_first_item_by_name().
    Removes the 'id' field and merges 'name' + 'columns' into one dict.
    """
    if not item:
        return {}

    flat = {"Name": item.get("name")}
    columns = item.get("columns", {})
    flat.update(columns)
    return flat

def _assert_no_errors(data: dict) -> None:
    """Raise a helpful error if Monday returned GraphQL errors."""
    if "errors" in data and data["errors"]:
        raise RuntimeError(f"Monday API error(s): {data['errors']}")

@lru_cache(maxsize=64)
def get_column_title_map(board_id: int) -> Dict[str, str]:
    """
    Returns a mapping like {'text_mkr56xn0': 'Email', 'dropdown_mkr5wcap': 'Financing Round', ...}.
    Cached to avoid re-fetching on every call.
    """
    data = execute_query(Q_COLUMNS, {"board_id": [board_id]})
    _assert_no_errors(data)
    boards = data.get("data", {}).get("boards", [])
    if not boards:
        return {}
    return {c["id"]: c["title"] for c in boards[0].get("columns", [])}

def get_column_id_map(board_id: int) -> Dict[str, str]:
    """
    Returns a reverse mapping like {'Email': 'text_mkr56xn0', 'Financing Round': 'dropdown_mkr5wcap', ...}.
    This is used to convert field names to column IDs for mutations.
    """
    title_map = get_column_title_map(board_id)
    return {title: col_id for col_id, title in title_map.items()}

def _format_column_value(value: any, column_id: str = None) -> any:
    """
    Format a value for Monday.com column_values JSON.
    Different column types require different formatting.
    Returns the value in the format expected by Monday.com (not JSON stringified yet).
    """
    if value is None:
        return ""
    
    # For arrays (multi-select columns like "Referral Source", "Sourced By")
    if isinstance(value, list):
        # Arrays should be formatted as labels
        if not value:
            return ""
        # For dropdown/tag columns, return labels dict (will be JSON stringified later)
        labels = [str(item) for item in value if item is not None]
        return {"labels": labels}
    
    # For boolean/Yes-No columns
    if isinstance(value, bool):
        return {"checked": "true" if value else "false"}
    
    # For numbers
    if isinstance(value, (int, float)):
        return str(value)
    
    # For strings (default)
    return str(value)

def _map_columns_by_title(raw_item: RawItemRecord, title_map: Dict[str, str]) -> ItemRecord:
    columns_named: Dict[str, Optional[str]] = {}
    for cv in raw_item.get("column_values", []):
        col_id = cv.get("id")
        title = title_map.get(col_id, col_id)  # fallback to id if we can't resolve
        columns_named[title] = cv.get("text")
    return ItemRecord(id=raw_item["id"], name=raw_item["name"], columns=columns_named)

def get_items_by_name(board_id: int, name: str, map_titles: bool = True) -> List[ItemRecord | RawItemRecord]:
    """
    Exact-match lookup on the built-in Name/title column.
    Returns a list of items (duplicate names possible).
    """
    data = execute_query(Q_BY_NAME, {"board_id": board_id, "name": name})
    _assert_no_errors(data)

    items: List[RawItemRecord] = (
        data.get("data", {})
            .get("items_page_by_column_values", {})
            .get("items", [])
    )

    if not map_titles:
        return items

    title_map = get_column_title_map(board_id)
    return [_map_columns_by_title(it, title_map) for it in items]

def execute_query(query: str, variables: dict = None):
    """Executes a Monday.com GraphQL query and returns the JSON response."""
    payload = {"query": dedent(query).strip(), "variables": variables or {}}
    response = requests.post(MONDAY_API_URL, headers=HEADERS, json=payload)
    response.raise_for_status()
    return response.json()

# ---------- Public API ----------

def get_first_item_by_name(schema: str, name: str, map_titles: bool = True):
    """
    Convenience: return just the first item (or None).
    """
    board_id = SCHEMA_BOARD_ID_MAP.get(schema)
    logger.data(f"Fetching item from board_id: {board_id} with name: {name}")
    if not board_id:
        raise ValueError(f"Unknown schema type: {schema}")
    items = get_items_by_name(board_id, name, map_titles=map_titles)
    item  = items[0] if items else None
    flattened_item  = flatten_item(item) if item else None
    return flattened_item


def get_first_item_by_email(schema: str, email: str, map_titles: bool = True):
    """
    Convenience: return just the first matching item by email (or None).
    """
    board_id = SCHEMA_BOARD_ID_MAP.get(schema)
    logger.data(f"Fetching item from board_id: {board_id} with email: {email}")
    if not board_id:
        raise ValueError(f"Unknown schema type: {schema}")

    items = get_items_by_email(board_id, email, map_titles=map_titles)
    item = items[0] if items else None
    flattened_item = flatten_item(item) if item else None
    return flattened_item

def create_item(board_id: int, item_name: str, column_data: Dict[str, any]) -> Dict[str, str]:
    """
    Create a new item in Monday.com.
    
    Args:
        board_id: The Monday.com board ID
        item_name: The name/title of the item
        column_data: Dict mapping column titles to values (e.g., {"Email": "test@example.com", "State": "California"})
    
    Returns:
        Dict with 'id' and 'name' of the created item
    """
    import json
    
    # Get column ID mapping
    col_id_map = get_column_id_map(board_id)
    
    # Convert column titles to IDs and format values
    column_values = {}
    for title, value in column_data.items():
        if value is None:
            continue
        
        col_id = col_id_map.get(title)
        if not col_id:
            logger.warning(f"Column '{title}' not found in board {board_id}, skipping")
            continue
        
        formatted_value = _format_column_value(value, col_id)
        if formatted_value:  # Only add non-empty values
            column_values[col_id] = formatted_value
    
    # Execute mutation
    logger.info(f"Creating item '{item_name}' in board {board_id} with {len(column_values)} columns")
    data = execute_query(
        M_CREATE_ITEM,
        {
            "board_id": board_id,
            "item_name": item_name,
            "column_values": json.dumps(column_values)
        }
    )
    _assert_no_errors(data)
    
    created_item = data.get("data", {}).get("create_item", {})
    logger.info(f"Created item {created_item.get('id')} - '{created_item.get('name')}'")
    return created_item

def update_item(board_id: int, item_id: str, column_data: Dict[str, any]) -> Dict[str, str]:
    """
    Update an existing item in Monday.com.
    
    Args:
        board_id: The Monday.com board ID
        item_id: The ID of the item to update
        column_data: Dict mapping column titles to values
    
    Returns:
        Dict with 'id' and 'name' of the updated item
    """
    import json
    
    # Get column ID mapping
    col_id_map = get_column_id_map(board_id)
    
    # Convert column titles to IDs and format values
    column_values = {}
    for title, value in column_data.items():
        col_id = col_id_map.get(title)
        if not col_id:
            logger.warning(f"Column '{title}' not found in board {board_id}, skipping")
            continue
        
        formatted_value = _format_column_value(value, col_id)
        # For updates, we include empty values to clear fields
        column_values[col_id] = formatted_value
    
    # Execute mutation
    logger.info(f"Updating item {item_id} in board {board_id} with {len(column_values)} columns")
    data = execute_query(
        M_UPDATE_ITEM,
        {
            "board_id": board_id,
            "item_id": item_id,
            "column_values": json.dumps(column_values)
        }
    )
    _assert_no_errors(data)
    
    updated_item = data.get("data", {}).get("change_multiple_column_values", {})
    logger.info(f"Updated item {updated_item.get('id')} - '{updated_item.get('name')}'")
    return updated_item

def upsert_item(schema_type: SchemaType, item_name: str, column_data: Dict[str, any], lookup_key: Optional[str] = None) -> tuple[Dict[str, str], bool]:
    """
    Create or update an item in Monday.com (upsert operation).
    
    Args:
        schema_type: The schema type enum
        item_name: The name/title for the item
        column_data: Dict mapping column titles to values
        lookup_key: Optional existing item lookup (name or email) - if provided, will try to update
    
    Returns:
        Tuple of (item_dict, was_created) where item_dict has 'id' and 'name', 
        and was_created is True if a new item was created, False if updated
    """
    board_id = SCHEMA_BOARD_ID_MAP.get(schema_type)
    if not board_id:
        raise ValueError(f"Unknown schema type: {schema_type}")
    
    # Try to find existing item
    existing_item = None
    if lookup_key:
        if schema_type in (SchemaType.DEAL_FLOW, SchemaType.VC_FUND):
            # Look up by name
            items = get_items_by_name(board_id, lookup_key, map_titles=False)
            existing_item = items[0] if items else None
        elif schema_type in (SchemaType.NETWORK, SchemaType.LP_MAIN_DASHBOARD):
            # Look up by email
            items = get_items_by_email(board_id, lookup_key, map_titles=False)
            existing_item = items[0] if items else None
    
    if existing_item:
        # Update existing item
        logger.info(f"Found existing item {existing_item['id']}, updating...")
        updated = update_item(board_id, existing_item['id'], column_data)
        return (updated, False)
    else:
        # Create new item
        logger.info(f"No existing item found, creating new item '{item_name}'...")
        created = create_item(board_id, item_name, column_data)
        return (created, True)
