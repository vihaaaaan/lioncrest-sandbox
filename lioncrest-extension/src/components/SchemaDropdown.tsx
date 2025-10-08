import { useEffect, useState } from 'react';
import { apiService } from '../api';
import type { SchemaInfo } from '../types';

type Props = {
  value: string;
  onChange: (val: string) => void;
};

export default function SchemaDropdown({ value, onChange }: Props) {
  const [schemas, setSchemas] = useState<SchemaInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSchemas() {
      try {
        setLoading(true);
        const response = await apiService.getSchemaNames();
        setSchemas(response.schemas);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load schemas');
        console.error('Failed to fetch schemas:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchSchemas();
  }, []);

  if (loading) {
    return (
      <select disabled className="w-full border border-gray-300 rounded p-2 text-gray-700 bg-gray-50">
        <option>Loading schemas...</option>
      </select>
    );
  }

  if (error) {
    return (
      <select disabled className="w-full border border-red-300 rounded p-2 text-red-700 bg-red-50">
        <option>Error loading schemas</option>
      </select>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-gray-300 rounded p-2 text-gray-700"
    >
      <option value="">Select a schema...</option>
      {schemas.map((schema) => (
        <option key={schema.value} value={schema.value}>
          {schema.display_name}
        </option>
      ))}
    </select>
  );
}
