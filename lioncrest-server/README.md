# Lioncrest Data Extraction API

A FastAPI-based service that uses OpenAI to extract structured data from unstructured text based on predefined schemas.

## Features

- **Network Extraction**: Extract contacts, organizations, and relationships
- **Deal Flow Extraction**: Extract startup and investment information
- **LP Dashboard Extraction**: Extract portfolio and performance metrics
- **VC Fund Extraction**: Extract fund information and portfolio data

## Setup

### 1. Install Dependencies

```bash
uv sync
```

### 2. Configure OpenAI API Key

Copy the `.env` file and add your OpenAI API key:

```bash
cp .env .env.local
```

Edit `.env` and replace `your_openai_api_key_here` with your actual OpenAI API key:

```
OPENAI_API_KEY=sk-your-actual-api-key-here
OPENAI_MODEL=gpt-4o-mini
```

### 3. Run the Server

```bash
python main.py
```

The API will be available at `http://localhost:8000`

## API Endpoints

### Health Check
- **GET** `/` - Check if the API is running

### Get Schemas
- **GET** `/schemas` - Get available extraction schemas and their definitions

### Extract Data
- **POST** `/extract-data` - Extract structured data from text

#### Request Format:
```json
{
  "text": "Your unstructured text here...",
  "schema_type": "network"
}
```

#### Schema Types:
- `network` - Extract networking information
- `deal_flow` - Extract startup/investment information
- `lp_main_dashboard` - Extract LP dashboard metrics
- `vc_fund` - Extract VC fund information

#### Response Format:
```json
{
  "extracted_data": {
    // Structured data based on schema type
  },
  "schema_type": "network",
  "success": true,
  "message": "Data extraction completed successfully using OpenAI"
}
```

## Usage Examples

### Network Extraction

```bash
curl -X POST "http://localhost:8000/extract-data" \
     -H "Content-Type: application/json" \
     -d '{
       "text": "John Smith is the CEO of TechCorp. His email is john@techcorp.com. He previously worked at InnovateLabs where he met Sarah Johnson, now CTO at DataFlow Inc.",
       "schema_type": "network"
     }'
```

### Deal Flow Extraction

```bash
curl -X POST "http://localhost:8000/extract-data" \
     -H "Content-Type: application/json" \
     -d '{
       "text": "StartupXYZ is a Series A fintech company that raised $10M led by Venture Capital Partners. The company processes $1M in monthly transactions.",
       "schema_type": "deal_flow"
     }'
```

## API Documentation

Once the server is running, visit:
- Interactive docs: `http://localhost:8000/docs`
- ReDoc documentation: `http://localhost:8000/redoc`

## Development

The API uses:
- **FastAPI** for the web framework
- **OpenAI API** for data extraction
- **Pydantic** for data validation
- **uvicorn** for the ASGI server

## Environment Variables

- `OPENAI_API_KEY` - Your OpenAI API key (required)
- `OPENAI_MODEL` - OpenAI model to use (default: gpt-4o-mini)