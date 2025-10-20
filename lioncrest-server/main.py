# main.py
import os
from typing import Dict, Any, Optional

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from llm_utils.llm_utils import OpenAIClient
from llm_utils.data_extractor.extractor import SchemaType, DataExtractor
from services.monday_client import get_first_item_by_name, upsert_item

# NEW: centralized logging
from logging_config import configure_logging, get_logger, with_request_context

# ------------------------------------------------------------------------------
# Configure logging & environment
# ------------------------------------------------------------------------------
configure_logging()
logger = get_logger(__name__)

load_dotenv()

# ------------------------------------------------------------------------------
# LLM client + extractor
# ------------------------------------------------------------------------------
client = OpenAIClient()
extractor = DataExtractor(client)

# ------------------------------------------------------------------------------
# Models
# ------------------------------------------------------------------------------
class DataExtractionRequest(BaseModel):
    text: str
    schema_type: SchemaType



class DataExtractionResponse(BaseModel):
    extracted_data: Dict[str, Any]
    schema_type: SchemaType
    success: bool
    message: Optional[str] = None
    is_update: bool = False
    change_metadata: Optional[Dict[str, Any]] = None
    monday_item_id: Optional[str] = None
    monday_item_name: Optional[str] = None

class MondayRecordRequest(BaseModel):
    table_name: str
    item_name: str

class MondayRecordResponse(BaseModel):
    data: Dict[str, Any] | None
    table_name: SchemaType
    item_name: str

class SchemaRequest(BaseModel):
    schema_type: SchemaType

class MondayUpsertRequest(BaseModel):
    schema_type: SchemaType
    column_data: Dict[str, Any]
    lookup_key: Optional[str] = None

class MondayUpsertResponse(BaseModel):
    monday_item_id: str
    monday_item_name: str
    was_created: bool
    success: bool
    message: Optional[str] = None


# ------------------------------------------------------------------------------
# FastAPI app
# ------------------------------------------------------------------------------
app = FastAPI(
    title="Lioncrest Data Extraction API",
    description="API for extracting structured data from text based on different schemas",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.get("/")
async def root(request: Request):
    """Health check endpoint"""
    return {"message": "Lioncrest Data Extraction API is running"}


@app.get("/schema_names")
async def get_schemas(request: Request):
    """
    Get available schema types for data extraction.
    Returns a list of all supported schema types.
    """
    req_extra = with_request_context(
        request_id=getattr(request.state, "request_id", None),
        method="GET",
        path="/schema",
    )
    
    logger.info("get-schemas called", extra=req_extra)
    
    # Return both schema value and display name for each schema type
    schema_info = [
        {
            "value": schema.value,
            "display_name": schema.display_name
        }
        for schema in SchemaType
    ]
    
    logger.info(f"returning {len(schema_info)} schema types", extra=req_extra)
    
    return {
        "schemas": schema_info,
        "count": len(schema_info),
        "success": True,}


@app.get("/schema")
async def get_schema_definition(request: Request, schema_type: SchemaType):
    """
    Get the JSON schema definition for a specific schema type.
    Returns the complete schema structure with field definitions for the requested schema.
    """
    req_extra = with_request_context(
        request_id=getattr(request.state, "request_id", None),
        method="POST",
        path="/schemas",
    )
    
    logger.info(f"get-schema-definition called for {schema_type.value}", extra=req_extra)
    
    try:
        # Get the Pydantic model for this schema type
        model = extractor._data_model_for(schema_type)
        # Get the JSON schema
        json_schema = model.model_json_schema()
        
        schema_data = {
            "schema_type": schema_type.value,
            "display_name": schema_type.display_name,
            "schema": json_schema,
            "fields": {
                field_name: {
                    "alias": field_info.alias or field_name,
                    "description": field_info.description or "",
                    "type": str(field_info.annotation) if hasattr(field_info, 'annotation') else "unknown",
                    "required": field_info.is_required() if hasattr(field_info, 'is_required') else False
                }
                for field_name, field_info in model.model_fields.items()
            }
        }
        
        logger.info(f"returning schema definition for {schema_type.value}", extra=req_extra)
        
        return {
            "schema": schema_data,
            "success": True,
        }
        
    except Exception as e:
        logger.warning(f"Failed to get schema for {schema_type.value}: {e}", extra=req_extra)
        raise HTTPException(
            status_code=400, 
            detail=f"Failed to load schema for {schema_type.value}: {str(e)}"
        ) from e


@app.post("/update-data", response_model=DataExtractionResponse)
async def update_data(request: Request, body: DataExtractionRequest):
    """
    Extract structured data from text based on the specified schema type.
    """
    # Build structured context for logging
    req_extra = with_request_context(
        request_id=getattr(request.state, "request_id", None),
        method="POST",
        path="/extract-data",
    )

    logger.data("request body", extra={**req_extra, "body": body.model_dump()})

    logger.info("extract-data called", extra=req_extra)

    # First, need to grab the data of the corresponding item from Monday.com (if it exists)
    existing_data = None
    lookup_key = None
    
    if body.schema_type in (SchemaType.DEAL_FLOW, SchemaType.VC_FUND):
        # For Deal Flow and VC Fund, look up by entity name
        entity_name = extractor.extract_entity_name_only(schema_type=body.schema_type, text=body.text)
        if entity_name:
            lookup_key = entity_name
            existing_data = get_first_item_by_name(body.schema_type.value, entity_name)
    elif body.schema_type in (SchemaType.NETWORK, SchemaType.LP_MAIN_DASHBOARD):
        # For Network and LP, look up by email
        email = extractor.extract_email_only(schema_type=body.schema_type, text=body.text)
        if email:
            lookup_key = email
            existing_data = get_first_item_by_name(body.schema_type.value, email)
    
    if existing_data:
        logger.data(f"Existing data found for '{lookup_key}': {existing_data}", extra=req_extra)
        
        # Update existing record with new information
        try:
            parsed_obj, alias_dict, change_metadata = extractor.extract_with_update(
                schema_type=body.schema_type,
                text=body.text,
                existing_data=existing_data,
                log_extra=req_extra,
            )
            logger.data(f"parsed_obj (update): {parsed_obj}", extra=req_extra)
            logger.info(
                f"Updated {change_metadata['total_changes']} fields: {change_metadata['updated_fields']}",
                extra=req_extra
            )
        except ValueError as e:
            logger.warning(f"bad request during update: {e}", extra=req_extra)
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            logger.exception("unexpected error during update extraction", extra=req_extra)
            raise HTTPException(status_code=500, detail="Update extraction failed") from e

        logger.info("update extraction succeeded", extra=req_extra)

        return DataExtractionResponse(
            extracted_data=alias_dict,
            schema_type=body.schema_type,
            success=True,
            message=f"Data updated successfully. {change_metadata['total_changes']} fields changed.",
            is_update=True,
            change_metadata=change_metadata,
        )

    else:
        # New record - perform initial extraction
        try:
            parsed_obj, alias_dict = extractor.extract(
                schema_type=body.schema_type,
                text=body.text,
                log_extra=req_extra,
            )
            logger.data(f"parsed_obj: {parsed_obj}", extra=req_extra)
        except ValueError as e:
            logger.warning(f"bad request: {e}", extra=req_extra)
            raise HTTPException(status_code=400, detail=str(e)) from e
        except Exception as e:
            logger.exception("unexpected error during extraction", extra=req_extra)
            raise HTTPException(status_code=500, detail="Extraction failed") from e

        logger.info("extraction succeeded", extra=req_extra)

        return DataExtractionResponse(
            extracted_data=alias_dict,
            schema_type=body.schema_type,
            success=True,
            message="Data extracted successfully",
        )

@app.get("/monday-com/record", response_model=MondayRecordResponse)
async def get_record(table_name: str, item_name: str):
    try:
        data = get_first_item_by_name(table_name, item_name)
        logger.data(f"Monday.com record data: {data}")
        if not data:
            raise HTTPException(status_code=404, detail="Item not found")
        return MondayRecordResponse(
            data=data,
            table_name=table_name,
            item_name=item_name,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Monday API error: {e}")

@app.post("/monday-com/upsert", response_model=MondayUpsertResponse)
async def upsert_to_monday(request: Request, body: MondayUpsertRequest):
    """
    Upsert (create or update) an item in Monday.com.
    This is called explicitly when the user clicks "Save to Monday.com" in the UI.
    """
    req_extra = with_request_context(
        request_id=getattr(request.state, "request_id", None),
        method="POST",
        path="/monday-com/upsert",
    )
    
    logger.info(f"monday-com/upsert called for {body.schema_type.value}", extra=req_extra)
    
    try:
        # Get item name from extracted data (usually "Name" field)
        item_name = body.column_data.get("Name") or body.lookup_key or "Untitled Item"
        
        monday_item, was_created = upsert_item(
            schema_type=body.schema_type,
            item_name=item_name,
            column_data=body.column_data,
            lookup_key=body.lookup_key
        )
        
        action = "Created" if was_created else "Updated"
        logger.info(
            f"{action} Monday.com item {monday_item.get('id')} - '{monday_item.get('name')}'",
            extra=req_extra
        )
        
        return MondayUpsertResponse(
            monday_item_id=monday_item.get("id"),
            monday_item_name=monday_item.get("name"),
            was_created=was_created,
            success=True,
            message=f"{action} item successfully in Monday.com"
        )
        
    except Exception as e:
        logger.exception("Failed to upsert to Monday.com", extra=req_extra)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upsert to Monday.com: {str(e)}"
        ) from e

def main():
    """Run the FastAPI server"""
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=True,
        log_level=os.getenv("LOG_LEVEL", "info").lower(),
    )


if __name__ == "__main__":
    main()
