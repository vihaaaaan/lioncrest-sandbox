import type { DataExtractionRequest, DataExtractionResponse } from '../types';

const API_BASE_URL = 'http://localhost:8000';

export const apiService = {
  async extractData(request: DataExtractionRequest): Promise<DataExtractionResponse> {
    const response = await fetch(`${API_BASE_URL}/update-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `API request failed: ${response.status}`);
    }

    return response.json();
  },

  async getSchemaNames() {
    const response = await fetch(`${API_BASE_URL}/schema_names`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch schema names: ${response.status}`);
    }

    return response.json();
  },

  async getSchema(schemaType: string) {
    const response = await fetch(`${API_BASE_URL}/schema?schema_type=${encodeURIComponent(schemaType)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Failed to fetch schema: ${response.status}`);
    }

    return response.json();
  },

  async healthCheck() {
    const response = await fetch(`${API_BASE_URL}/`);
    
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }

    return response.json();
  },

  async upsertToMonday(schemaType: string, columnData: Record<string, any>, lookupKey?: string | null) {
    const response = await fetch(`${API_BASE_URL}/monday-com/upsert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        schema_type: schemaType,
        column_data: columnData,
        lookup_key: lookupKey,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Failed to save to Monday.com: ${response.status}`);
    }

    return response.json();
  }
};
