import type { DataExtractionRequest, DataExtractionResponse } from './types';

const API_BASE_URL = 'http://localhost:8000';

export const apiService = {
  async extractData(request: DataExtractionRequest): Promise<DataExtractionResponse> {
    const response = await fetch(`${API_BASE_URL}/extract-data`, {
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

  async getSchemas() {
    const response = await fetch(`${API_BASE_URL}/schemas`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch schemas: ${response.status}`);
    }

    return response.json();
  },

  async healthCheck() {
    const response = await fetch(`${API_BASE_URL}/`);
    
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }

    return response.json();
  }
};
