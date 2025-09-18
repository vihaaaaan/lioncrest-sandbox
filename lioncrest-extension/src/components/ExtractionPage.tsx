import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SchemaType, SchemaTypeLabels } from '../types';
import type { DataExtractionRequest } from '../types';
import { apiService } from '../api';
import { useGmailContext } from "../extension/useGmailContext";


export default function ExtractionPage() {
  const [inputText, setInputText] = useState('');
  const [selectedSchema, setSelectedSchema] = useState<SchemaType>(SchemaType.NETWORK);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { threadId, accountIndex } = useGmailContext();

  useEffect(() => {
    console.log("[panel] ctx", { threadId, accountIndex });
  }, [threadId, accountIndex]);


  const handleExtractData = async () => {
    if (!inputText.trim()) {
      setError('Please enter some text first');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const request: DataExtractionRequest = {
        text: inputText,
        schema_type: selectedSchema
      };

      const response = await apiService.extractData(request);
      
      // Navigate to results page with the extracted data
      navigate('/results', { 
        state: { 
          extractedData: response.extracted_data,
          schemaType: response.schema_type,
          originalText: inputText
        } 
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearAll = () => {
    setInputText('');
    setError('');
  };

  return (
    <div className="app-container">
          <div className="p-4 space-y-2">
      <div className="font-medium">Gmail thread detection</div>
      <div className="text-sm">Account: /u/{accountIndex}</div>
      <div className="text-sm">Thread: {threadId ?? "None"}</div>
      {!threadId && <div className="text-xs opacity-70">Open a Gmail thread to see data.</div>}
    </div>
    
      <div className="card">
        <div className="input-section">
          <div className="schema-selector">
            <select
              id="schema-select"
              value={selectedSchema}
              onChange={(e) => setSelectedSchema(e.target.value as SchemaType)}
              className="schema-select"
            >
              {Object.entries(SchemaTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <textarea
            id="text-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste your text here to extract structured data..."
            rows={8}
            className="text-input"
          />
        </div>
        
        <div className="button-group">
          <button
            onClick={handleExtractData}
            disabled={isLoading || !inputText.trim()}
            className="extract-button"
          >
            {isLoading ? 'Extracting Data...' : 'Extract Data'}
          </button>
          <button
            onClick={handleClearAll}
            className="clear-button"
          >
            Clear All
          </button>
        </div>

        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        )}
      </div>
    </div>
  );
}
