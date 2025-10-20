import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiService } from '../utils/api';
import type { ExtractedData } from '../types';
import { ExclamationTriangleIcon } from '@heroicons/react/16/solid';

interface LocationState {
  extractedData: ExtractedData;
  schemaType: string;
  originalText: string;
  isUpdate?: boolean;
  changeMetadata?: {
    updated_fields: string[];
    added_fields: string[];
    unchanged_fields: string[];
    changes: Record<string, { old: any; new: any }>;
    total_changes: number;
  };
}

interface SchemaField {
  alias: string;
  description: string;
  type: string;
  required: boolean;
}

interface SchemaDefinition {
  schema_type: string;
  display_name: string;
  schema: any;
  fields: Record<string, SchemaField>;
}

const PRIMARY = '#031F53';
const fmtKey = (s: string) => s.toUpperCase();
const isMultilineKey = (k: string) => /notes?|description|summary|context|message|files?/i.test(k);

export default function ResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | undefined;

  const [schemaLoading, setSchemaLoading] = useState(true);
  const [editedData, setEditedData] = useState<ExtractedData>({});
  const [error, setError] = useState('');
  const [schemaDefinition, setSchemaDefinition] = useState<SchemaDefinition | null>(null);
  
  // Monday.com save state
  const [mondaySaving, setMondaySaving] = useState(false);
  const [mondaySuccess, setMondaySuccess] = useState<{
    itemId: string;
    itemName: string;
    wasCreated: boolean;
  } | null>(null);
  const [mondayError, setMondayError] = useState<string | null>(null);

  // Fetch schema definition on mount
  useEffect(() => {
    async function loadSchema() {
      if (!state?.schemaType) {
        navigate('/');
        return;
      }
      
      try {
        setSchemaLoading(true);
        const response = await apiService.getSchema(state.schemaType);
        setSchemaDefinition(response.schema);
      } catch (err) {
        console.error('Failed to load schema:', err);
        setError('Failed to load schema definition');
      } finally {
        setSchemaLoading(false);
      }
    }
    
    loadSchema();
  }, [state?.schemaType, navigate]);

  useEffect(() => {
    if (!state?.extractedData) {
      navigate('/');
      return;
    }
    setEditedData(state.extractedData);
  }, [state, navigate]);

  const setField = (key: string, value: string) => {
    setEditedData(prev => ({ ...prev, [key]: value }));
  };

  const handleBack = () => {
    const confirmed = window.confirm(
      'Are you sure you want to go back? You will lose all extracted data that has not been sent to Monday.com.'
    );
    
    if (confirmed) {
      navigate('/');
    }
  };

  const handleSendToMonday = async () => {
    setMondaySaving(true);
    setMondayError(null);
    setError('');
    try {
      // Determine lookup key based on schema type and update status
      let lookupKey: string | null = null;
      if (state?.isUpdate) {
        // For updates, we need to find the lookup key
        if (state.schemaType === 'deal_flow' || state.schemaType === 'vc_fund') {
          lookupKey = editedData['Name'] as string || null;
        } else if (state.schemaType === 'network' || state.schemaType === 'lp_main_dashboard') {
          lookupKey = editedData['Email'] as string || null;
        }
      }
      
      const response = await apiService.upsertToMonday(
        state!.schemaType,
        editedData,
        lookupKey
      );
      
      setMondaySuccess({
        itemId: response.monday_item_id,
        itemName: response.monday_item_name,
        wasCreated: response.was_created,
      });
    } catch (err: any) {
      setMondayError(err.message || 'Failed to save to Monday.com');
      setError('Failed to send data to Monday.com');
    } finally {
      setMondaySaving(false);
    }
  };

  // Get enum options for a field from the schema definition
  const getEnumOptions = (fieldAlias: string): string[] | null => {
    if (!schemaDefinition?.schema?.$defs) return null;
    
    // Find the property in the schema
    const properties = schemaDefinition.schema.properties;
    const property = properties?.[fieldAlias];
    
    if (!property) return null;
    
    // Check if it references an enum definition
    let enumRef: string | null = null;
    
    // Obtain reference to enum definition
    if (property.$ref) {
      enumRef = property.$ref;
    } else if (property.anyOf) {
      // Handle Optional[Enum] pattern
      const refItem = property.anyOf.find((item: any) => item.$ref);
      if (refItem) enumRef = refItem.$ref;
    } else if (property.items?.$ref) {
      // Handle List[Enum] pattern
      enumRef = property.items.$ref;
    }
    
    if (!enumRef) return null;
    
    // Extract the definition name from #/$defs/EnumName
    const defName = enumRef.split('/').pop();
    if (!defName) return null;
    
    const enumDef = schemaDefinition.schema.$defs[defName];
    return enumDef?.enum || null;
  };

  const Field = ({
    label,
    value,
    onChange,
    isUpdated,
  }: { 
    label: string; 
    value?: string | string[]; 
    onChange: (v: string) => void;
    isUpdated?: boolean;
  }) => {
    const multiline = isMultilineKey(label);
    const enumOptions = getEnumOptions(label);
    
    // Handle array values (convert to display string)
    const displayValue = Array.isArray(value) ? value.join(', ') : (value ?? '');
    
    return (
      <div className="space-y-1 relative">
        <label className="block text-[10px] font-semibold tracking-wide text-gray-600 flex items-center gap-2">
          {fmtKey(label)}
          {isUpdated && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-medium bg-blue-100 text-blue-800">
              UPDATED
            </span>
          )}
        </label>
        {enumOptions ? (
          <select
            value={displayValue}
            onChange={(e) => onChange(e.target.value)}
            className={`w-full rounded border p-2 text-sm text-gray-800 focus:outline-none focus:ring-2 bg-white ${
              isUpdated ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
            }`}
            style={{ outlineColor: PRIMARY }}
          >
            <option value="">-- Select --</option>
            {enumOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : multiline ? (
          <textarea
            value={displayValue}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            className={`w-full rounded border p-2 text-sm text-gray-800 focus:outline-none focus:ring-2 ${
              isUpdated ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
            }`}
            style={{ outlineColor: PRIMARY }}
          />
        ) : (
          <input
            type="text"
            value={displayValue}
            onChange={(e) => onChange(e.target.value)}
            className={`w-full rounded border p-2 text-sm text-gray-800 focus:outline-none focus:ring-2 ${
              isUpdated ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
            }`}
            style={{ outlineColor: PRIMARY }}
          />
        )}
      </div>
    );
  };

  const SectionCard = ({
    title,
    children,
  }: { title: string; children: React.ReactNode }) => (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-xs font-bold" style={{ color: PRIMARY }}>{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );

  const renderFields = () => {
    if (!schemaDefinition) return null;
    
    // Get all field keys from extracted data
    const fieldKeys = Object.keys(editedData ?? {});
    const updatedFields = state?.changeMetadata?.updated_fields || [];
    const addedFields = state?.changeMetadata?.added_fields || [];
    
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {fieldKeys.map((fieldKey) => {
          const isUpdated = updatedFields.includes(fieldKey) || addedFields.includes(fieldKey);
          return (
            <Field
              key={fieldKey}
              label={fieldKey}
              value={editedData[fieldKey]}
              onChange={(v) => setField(fieldKey, v)}
              isUpdated={isUpdated}
            />
          );
        })}
      </div>
    );
  };

  if (schemaLoading) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <div className="text-sm text-gray-600">Loading schema...</div>
      </div>
    );
  }

  if (!state?.extractedData || !schemaDefinition) {
    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
    return <div className="p-4 text-sm text-gray-600">Loading...</div>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Monday.com Success Banner */}
      {mondaySuccess && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-green-900">
                {mondaySuccess.wasCreated ? 'Created' : 'Updated'} in Monday.com
              </h3>
              <p className="mt-1 text-xs text-green-700">
                {mondaySuccess.wasCreated ? 'Created new item' : 'Updated existing item'}: <strong>{mondaySuccess.itemName || 'Untitled'}</strong>
              </p>
              <a
                href={`https://lioncrestvc.monday.com/boards/${mondaySuccess.itemId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800 underline"
              >
                View in Monday.com
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Monday.com Error Banner */}
      {mondayError && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-900">
                Failed to save to Monday.com
              </h3>
              <p className="mt-1 text-xs text-red-700">
                {mondayError}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Update Banner */}
      {state?.isUpdate && state?.changeMetadata && state.changeMetadata.total_changes > 0 && (
        <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900">
                Record Updated
              </h3>
              <p className="mt-1 text-xs text-blue-700">
                {state.changeMetadata.total_changes} field{state.changeMetadata.total_changes !== 1 ? 's' : ''} updated: {' '}
                {[...state.changeMetadata.updated_fields, ...state.changeMetadata.added_fields].join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-800 hover:bg-gray-50"
          >
            ← Back
          </button>
          <h1 className="text-base font-semibold" style={{ color: PRIMARY }}>
            {state?.isUpdate ? 'Review Updates' : 'Review Data'}
          </h1>
        </div>
      </div>

      {/* Editor */}
      <div className="space-y-6">
        <SectionCard title={schemaDefinition.display_name}>
          {renderFields()}
        </SectionCard>
      </div>

      {/* Actions */}
      <div className="mt-3">
        <button
          onClick={handleSendToMonday}
          disabled={mondaySaving || !!mondaySuccess}
          className="w-full px-3 py-2 rounded text-white text-sm hover:opacity-90 active:opacity-80 disabled:opacity-50 transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-lg active:scale-95 flex items-center justify-center gap-2"
          style={{ backgroundColor: mondaySuccess ? '#10b981' : PRIMARY }}
        >
          {mondaySaving && (
            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          )}
          {mondaySaving ? 'Saving to Monday.com…' : mondaySuccess ? '✓ Saved to Monday.com' : 'Save to Monday.com'}
        </button>
      </div>
      
      {error && !mondayError && (
        <p className="w-full mt-3 px-3 py-2 rounded text-white text-xs bg-red-500 disabled:opacity-50 flex items-center justify-center gap-2">
          <ExclamationTriangleIcon className="h-4 w-4 text-white" />
          {error}
        </p>
      )}
    </div>
  );
}
