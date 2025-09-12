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

# Load environment variables
load_dotenv()


# Schema type enumeration
class SchemaType(str, Enum):
    NETWORK = "network"
    DEAL_FLOW = "deal_flow"
    LP_MAIN_DASHBOARD = "lp_main_dashboard"
    VC_FUND = "vc_fund"


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


# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


# JSON schemas for each extraction type
SCHEMAS = {
    "network": {
        "type": "object",
        "properties": {
            "contacts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "title": {"type": "string"},
                        "company": {"type": "string"},
                        "email": {"type": "string"},
                        "phone": {"type": "string"},
                        "linkedin": {"type": "string"}
                    }
                }
            },
            "organizations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "type": {"type": "string"},
                        "industry": {"type": "string"},
                        "description": {"type": "string"},
                        "website": {"type": "string"}
                    }
                }
            },
            "relationships": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "from_entity": {"type": "string"},
                        "to_entity": {"type": "string"},
                        "relationship_type": {"type": "string"},
                        "description": {"type": "string"}
                    }
                }
            }
        }
    },
    "deal_flow": {
        "type": "object",
        "properties": {
            "company_name": {"type": "string"},
            "industry": {"type": "string"},
            "stage": {"type": "string"},
            "funding_amount": {"type": "string"},
            "valuation": {"type": "string"},
            "investors": {
                "type": "array",
                "items": {"type": "string"}
            },
            "founders": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "role": {"type": "string"},
                        "background": {"type": "string"}
                    }
                }
            },
            "business_model": {"type": "string"},
            "market_size": {"type": "string"},
            "competitive_advantage": {"type": "string"},
            "key_metrics": {
                "type": "object",
                "properties": {
                    "revenue": {"type": "string"},
                    "growth_rate": {"type": "string"},
                    "users": {"type": "string"}
                }
            }
        }
    },
    "vc_fund": {
        "type": "object",
        "properties": {
            "fund_name": {"type": "string"},
            "fund_size": {"type": "string"},
            "vintage_year": {"type": "string"},
            "investment_focus": {"type": "string"},
            "geographic_focus": {"type": "string"},
            "stage_focus": {"type": "string"},
            "portfolio_companies": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "company_name": {"type": "string"},
                        "investment_date": {"type": "string"},
                        "investment_amount": {"type": "string"},
                        "current_status": {"type": "string"},
                        "sector": {"type": "string"}
                    }
                }
            },
            "fund_performance": {
                "type": "object",
                "properties": {
                    "total_invested": {"type": "string"},
                    "current_value": {"type": "string"},
                    "realized_returns": {"type": "string"},
                    "irr": {"type": "string"},
                    "multiple": {"type": "string"}
                }
            },
            "fund_managers": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "role": {"type": "string"},
                        "experience": {"type": "string"}
                    }
                }
            }
        }
    }
}

SCHEMAS["lp_main_dashboard"] = {
    "type": "object",
    "properties": {
        "Name": {"type": "string"},
        "LP Connection": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Names only, e.g., ['Alice Chen', 'Bob Li']"
        },
        "Amount $": {"type": "string"},
        "Email": {"type": "string"},
        "Notes": {"type": "string"},
        "Status": {"type": "string"},
        "Fund": {"type": "string"},
        "sent email?": {"type": "string"},
        "Follow Up date": {"type": "string"},
        "Upcoming Meeting": {"type": "string"},
        "Last Reach Out": {"type": "string"},
        "Country": {"type": "string"},
        "State": {"type": "string"},
        "City": {"type": "string"}
    },
    "additionalProperties": False
}


def get_extraction_prompt(schema_type: str, text: str) -> str:
    """Generate the appropriate prompt for data extraction based on schema type"""
    
    prompts = {
        "network": f"""
        Extract networking information from the following text. Focus on identifying:
        - People and their contact information (names, titles, companies, emails, phones, LinkedIn profiles)
        - Organizations and companies mentioned
        - Relationships between people and organizations
        
        Text to analyze:
        {text}
        
        Return the data in the specified JSON format. If information is not available, use empty strings or empty arrays.
        """,
        
        "deal_flow": f"""
        Extract deal flow information from the following text. Focus on identifying:
        - Company details (name, industry, stage)
        - Funding information (amount, valuation, investors)
        - Founder information
        - Business model and market details
        - Key performance metrics
        
        Text to analyze:
        {text}
        
        Return the data in the specified JSON format. If information is not available, use empty strings or empty arrays.
        """,
        
        "lp_main_dashboard": f"""
            Extract fields for a simple demo JSON. Use the EXACT field names below as keys.
            If a field isn't clearly present, OMIT it (do not invent values).

            Fields (exact keys):
            - Name
            - LP Connection  (array of names, e.g., ["Jane Doe"])
            - Amount $
            - Email
            - Notes
            - Status
            - Fund
            - sent email?
            - Follow Up date  (any readable date string is fine)
            - Upcoming Meeting
            - Last Reach Out
            - Country
            - State
            - City

            Rules:
            - Keep it minimal; plain strings (or array of strings for LP Connection).
            - It's OK if dates are not ISO; just capture what's in the text.
            - Don't include keys that aren't supported above.
            - Return ONLY the JSON object.

            Text to analyze:
            {text}
            """
        ,
        
        "vc_fund": f"""
        Extract venture capital fund information from the following text. Focus on identifying:
        - Fund details (name, size, vintage year, focus areas)
        - Portfolio companies and investments
        - Fund performance metrics
        - Fund managers and team information
        
        Text to analyze:
        {text}
        
        Return the data in the specified JSON format. If information is not available, use empty strings or empty arrays.
        """
    }
    
    return prompts.get(schema_type, "")


async def extract_data_with_openai(text: str, schema_type: str) -> Dict[str, Any]:
    """Extract data using OpenAI API with structured output"""
    
    try:
        schema = SCHEMAS.get(schema_type)
        if not schema:
            raise ValueError(f"Unknown schema type: {schema_type}")
        
        prompt = get_extraction_prompt(schema_type, text)
        
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert data extraction assistant. Extract structured information from text according to the provided JSON schema. Be thorough and accurate."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": f"{schema_type}_extraction",
                    "schema": schema
                }
            },
            temperature=0.1
        )
        
        extracted_data = json.loads(response.choices[0].message.content)
        return extracted_data
        
    except Exception as e:
        raise Exception(f"OpenAI extraction failed: {str(e)}")
app = FastAPI(
    title="Lioncrest Data Extraction API",
    description="API for extracting structured data from text based on different schemas",
    version="0.1.0"
)

# Add CORS middleware to allow Chrome extension access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your extension's origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "Lioncrest Data Extraction API is running"}


@app.get("/schemas")
async def get_schemas():
    """Get available extraction schemas"""
    return {
        "available_schemas": ["network", "deal_flow", "lp_main_dashboard", "vc_fund"],
        "schema_definitions": SCHEMAS
    }


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
        # Validate that we have an OpenAI API key
        if not os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY") == "your_openai_api_key_here":
            raise HTTPException(
                status_code=500,
                detail="OpenAI API key not configured. Please set OPENAI_API_KEY in your .env file."
            )
        
        # Extract data using OpenAI
        extracted_data = await extract_data_with_openai(request.text, request.schema_type.value)
        
        return DataExtractionResponse(
            extracted_data=extracted_data,
            schema_type=request.schema_type,
            success=True,
            message="Data extraction completed successfully using OpenAI"
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error during data extraction: {str(e)}"
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
