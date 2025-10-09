import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiService } from '../api';
import type { ExtractedData } from '../types';
import { ExclamationTriangleIcon } from '@heroicons/react/16/solid';

interface LocationState {
  extractedData: ExtractedData;
  schemaType: string;
  originalText: string;
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

  const [isLoading, setIsLoading] = useState(false);
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [editedData, setEditedData] = useState<ExtractedData>({});
  const [error, setError] = useState('');
  const [schemaDefinition, setSchemaDefinition] = useState<SchemaDefinition | null>(null);

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
    setIsLoading(true);
    setError('');
    try {
      // TODO: call your Monday API with { schemaType: state!.schemaType, data: editedData }
      await new Promise(res => setTimeout(res, 800));
      alert('Data successfully sent to Monday.com!');
      navigate('/');
    } catch {
      setError('Failed to send data to Monday.com');
    } finally {
      setIsLoading(false);
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
  }: { label: string; value?: string | string[]; onChange: (v: string) => void }) => {
    const multiline = isMultilineKey(label);
    const enumOptions = getEnumOptions(label);
    
    // Handle array values (convert to display string)
    const displayValue = Array.isArray(value) ? value.join(', ') : (value ?? '');
    
    return (
      <div className="space-y-1">
        <label className="block text-[10px] font-semibold tracking-wide text-gray-600">
          {fmtKey(label)}
        </label>
        {enumOptions ? (
          <select
            value={displayValue}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded border border-gray-300 p-2 text-sm text-gray-800 focus:outline-none focus:ring-2 bg-white"
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
            className="w-full rounded border border-gray-300 p-2 text-sm text-gray-800 focus:outline-none focus:ring-2"
            style={{ outlineColor: PRIMARY }}
          />
        ) : (
          <input
            type="text"
            value={displayValue}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded border border-gray-300 p-2 text-sm text-gray-800 focus:outline-none focus:ring-2"
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
    
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {fieldKeys.map((fieldKey) => (
          <Field
            key={fieldKey}
            label={fieldKey}
            value={editedData[fieldKey]}
            onChange={(v) => setField(fieldKey, v)}
          />
        ))}
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
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-800 hover:bg-gray-50"
          >
            ← Back
          </button>
          <h1 className="text-base font-semibold" style={{ color: PRIMARY }}>Review Data</h1>
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
          disabled={isLoading}
          className="w-full px-3 py-2 rounded text-white text-sm bg-[#031F53] hover:opacity-90 active:opacity-80 disabled:opacity-50"
          style={{ backgroundColor: PRIMARY }}
        >
          {isLoading ? 'Sending to Monday.com…' : 'Send to Monday.com'}
        </button>
      </div>
      
      {error && (
        <p className="w-full mt-3 px-3 py-2 rounded text-white text-xs bg-red-500 disabled:opacity-50 flex items-center justify-center gap-2">
          <ExclamationTriangleIcon className="h-4 w-4 text-white" />
          {error}
        </p>
      )}
    </div>
  );
}
