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


class SchemaRequest(BaseModel):
    schema_type: SchemaType


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


@app.post("/extract-data", response_model=DataExtractionResponse)
async def extract_data(request: Request, body: DataExtractionRequest):
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
