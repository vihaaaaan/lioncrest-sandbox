import json
import os
from enum import Enum
from typing import Dict, Any, Optional

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel
from llm_utils.llm_utils import OpenAIClient
from llm_utils.data_extractor.schemas import Network, DealFlow, VCFund, LPMainDashboard
from llm_utils.data_extractor.extractor import SchemaType
from llm_utils.data_extractor.extractor import DataExtractor
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()
client = OpenAIClient()
extractor = DataExtractor(client)

# Request model
class DataExtractionRequest(BaseModel):
    text: str
    schema_type: SchemaType


# Response model
class DataExtractionResponse(BaseModel):
    extracted_data: Dict[str, Any]
    schema_type: SchemaType
    success: bool
    message: Optional[str] = None

app = FastAPI(
    title="Lioncrest Data Extraction API",
    description="API for extracting structured data from text based on different schemas",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "Lioncrest Data Extraction API is running"}

@app.post("/extract-data", response_model=DataExtractionResponse)
async def extract_data(request: DataExtractionRequest):
    """
    Extract structured data from text based on the specified schema type.
    
    Args:
        request: Contains the text to process and the schema type to use
        
    Returns:
        Extracted data in the format specified by the schema type
    """
    try:
        parsed_obj, alias_dict = extractor.extract(text=request.text, schema_type=request.schema_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return DataExtractionResponse(
        extracted_data=alias_dict,
        schema_type=request.schema_type,
        success=True,
        message="Data extracted successfully"
    )

def main():
    """Run the FastAPI server"""
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )

if __name__ == "__main__":
    main()
