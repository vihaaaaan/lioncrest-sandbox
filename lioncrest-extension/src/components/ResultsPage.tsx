import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SchemaType } from '../types';
import type { ExtractedData, NetworkData, DealFlowData, LPMainDashboardData, VCFundData } from '../types';

interface LocationState {
  extractedData: ExtractedData;
  schemaType: SchemaType;
  originalText: string;
}

export default function ResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [editedData, setEditedData] = useState<ExtractedData>({});
  const [error, setError] = useState('');

  const state = location.state as LocationState;

  useEffect(() => {
    if (!state?.extractedData) {
      navigate('/');
      return;
    }
    setEditedData(state.extractedData);
  }, [state, navigate]);

  const handleDataChange = (key: string, value: any) => {
    setEditedData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleArrayItemChange = (arrayKey: string, index: number, itemKey: string, value: any) => {
    setEditedData(prev => {
      const array = (prev as any)[arrayKey] || [];
      const newArray = [...array];
      newArray[index] = {
        ...newArray[index],
        [itemKey]: value
      };
      return {
        ...prev,
        [arrayKey]: newArray
      };
    });
  };

  const handleSendToMonday = async () => {
    setIsLoading(true);
    setError('');

    try {
      // Simulate Monday.com API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Here you would integrate with Monday.com API
      console.log('Sending to Monday.com:', {
        schemaType: state.schemaType,
        data: editedData
      });

      alert('Data successfully sent to Monday.com!');
      navigate('/');
    } catch (err) {
      setError('Failed to send data to Monday.com');
    } finally {
      setIsLoading(false);
    }
  };

  const renderNetworkData = (data: NetworkData) => (
    <div className="data-section">
      <h3>Contacts</h3>
      {data.contacts?.map((contact, index) => (
        <div key={index} className="data-item">
          <h4>Contact {index + 1}</h4>
          {Object.entries(contact).map(([key, value]) => (
            <div key={key} className="field-group">
              <label>{key.replace('_', ' ').toUpperCase()}:</label>
              <input
                type="text"
                value={value || ''}
                onChange={(e) => handleArrayItemChange('contacts', index, key, e.target.value)}
                className="field-input"
              />
            </div>
          ))}
        </div>
      ))}

      <h3>Organizations</h3>
      {data.organizations?.map((org, index) => (
        <div key={index} className="data-item">
          <h4>Organization {index + 1}</h4>
          {Object.entries(org).map(([key, value]) => (
            <div key={key} className="field-group">
              <label>{key.replace('_', ' ').toUpperCase()}:</label>
              <input
                type="text"
                value={value || ''}
                onChange={(e) => handleArrayItemChange('organizations', index, key, e.target.value)}
                className="field-input"
              />
            </div>
          ))}
        </div>
      ))}

      <h3>Relationships</h3>
      {data.relationships?.map((rel, index) => (
        <div key={index} className="data-item">
          <h4>Relationship {index + 1}</h4>
          {Object.entries(rel).map(([key, value]) => (
            <div key={key} className="field-group">
              <label>{key.replace('_', ' ').toUpperCase()}:</label>
              <input
                type="text"
                value={value || ''}
                onChange={(e) => handleArrayItemChange('relationships', index, key, e.target.value)}
                className="field-input"
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  const renderDealFlowData = (data: DealFlowData) => (
    <div className="data-section">
      <h3>Company Information</h3>
      {Object.entries(data).filter(([key]) => !['investors', 'founders', 'key_metrics'].includes(key)).map(([key, value]) => (
        <div key={key} className="field-group">
          <label>{key.replace('_', ' ').toUpperCase()}:</label>
          <input
            type="text"
            value={value || ''}
            onChange={(e) => handleDataChange(key, e.target.value)}
            className="field-input"
          />
        </div>
      ))}

      <h3>Investors</h3>
      {data.investors?.map((investor, index) => (
        <div key={index} className="field-group">
          <label>Investor {index + 1}:</label>
          <input
            type="text"
            value={investor}
            onChange={(e) => {
              const newInvestors = [...(data.investors || [])];
              newInvestors[index] = e.target.value;
              handleDataChange('investors', newInvestors);
            }}
            className="field-input"
          />
        </div>
      ))}

      <h3>Founders</h3>
      {data.founders?.map((founder, index) => (
        <div key={index} className="data-item">
          <h4>Founder {index + 1}</h4>
          {Object.entries(founder).map(([key, value]) => (
            <div key={key} className="field-group">
              <label>{key.replace('_', ' ').toUpperCase()}:</label>
              <input
                type="text"
                value={value || ''}
                onChange={(e) => handleArrayItemChange('founders', index, key, e.target.value)}
                className="field-input"
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  const renderLPDashboardData = (data: LPMainDashboardData) => (
    <div className="data-section">
      <h3>LP Dashboard Information</h3>
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="field-group">
          <label>{key}:</label>
          {key === 'LP Connection' ? (
            <input
              type="text"
              value={Array.isArray(value) ? value.join(', ') : value || ''}
              onChange={(e) => handleDataChange(key, e.target.value.split(', ').filter(v => v.trim()))}
              className="field-input"
              placeholder="Separate multiple names with commas"
            />
          ) : (
            <input
              type="text"
              value={value || ''}
              onChange={(e) => handleDataChange(key, e.target.value)}
              className="field-input"
            />
          )}
        </div>
      ))}
    </div>
  );

  const renderVCFundData = (data: VCFundData) => (
    <div className="data-section">
      <h3>Fund Information</h3>
      {Object.entries(data).filter(([key]) => !['portfolio_companies', 'fund_performance', 'fund_managers'].includes(key)).map(([key, value]) => (
        <div key={key} className="field-group">
          <label>{key.replace('_', ' ').toUpperCase()}:</label>
          <input
            type="text"
            value={value || ''}
            onChange={(e) => handleDataChange(key, e.target.value)}
            className="field-input"
          />
        </div>
      ))}

      <h3>Portfolio Companies</h3>
      {data.portfolio_companies?.map((company, index) => (
        <div key={index} className="data-item">
          <h4>Company {index + 1}</h4>
          {Object.entries(company).map(([key, value]) => (
            <div key={key} className="field-group">
              <label>{key.replace('_', ' ').toUpperCase()}:</label>
              <input
                type="text"
                value={value || ''}
                onChange={(e) => handleArrayItemChange('portfolio_companies', index, key, e.target.value)}
                className="field-input"
              />
            </div>
          ))}
        </div>
      ))}

      <h3>Fund Performance</h3>
      {data.fund_performance && Object.entries(data.fund_performance).map(([key, value]) => (
        <div key={key} className="field-group">
          <label>{key.replace('_', ' ').toUpperCase()}:</label>
          <input
            type="text"
            value={value || ''}
            onChange={(e) => handleDataChange('fund_performance', { ...data.fund_performance, [key]: e.target.value })}
            className="field-input"
          />
        </div>
      ))}
    </div>
  );

  if (!state?.extractedData) {
    return <div>Loading...</div>;
  }

  return (
    <div className="app-container">
      <div className="header">
        <button onClick={() => navigate('/')} className="back-button">← Back</button>
        <h1>Review & Edit Data</h1>
      </div>

      <div className="results-container">
        <div className="schema-info">
          <h2>Extracted from: {state.schemaType.replace('_', ' ').toUpperCase()}</h2>
        </div>

        <div className="data-editor">
          {state.schemaType === SchemaType.NETWORK && renderNetworkData(editedData as NetworkData)}
          {state.schemaType === SchemaType.DEAL_FLOW && renderDealFlowData(editedData as DealFlowData)}
          {state.schemaType === SchemaType.LP_MAIN_DASHBOARD && renderLPDashboardData(editedData as LPMainDashboardData)}
          {state.schemaType === SchemaType.VC_FUND && renderVCFundData(editedData as VCFundData)}
        </div>

        <div className="action-buttons">
          <button
            onClick={handleSendToMonday}
            disabled={isLoading}
            className="monday-button"
          >
            {isLoading ? 'Sending to Monday.com...' : 'Send to Monday.com'}
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
