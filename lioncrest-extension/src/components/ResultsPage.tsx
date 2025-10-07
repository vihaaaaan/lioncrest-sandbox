import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SchemaType } from '../types';
import type {
  ExtractedData,
  NetworkPayload,
  DealFlowPayload,
  LPMainDashboardPayload,
  VCFundPayload,
} from '../types';
import { ExclamationTriangleIcon } from '@heroicons/react/16/solid';

interface LocationState {
  extractedData: ExtractedData;
  schemaType: SchemaType;
  originalText: string;
}

const PRIMARY = '#031F53';
const fmtKey = (s: string) => s.toUpperCase(); // aliases already provide spacing/case
const isMultilineKey = (k: string) => /notes?|description|summary|context|message|files?/i.test(k);

export default function ResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | undefined;

  const [isLoading, setIsLoading] = useState(false);
  const [editedData, setEditedData] = useState<ExtractedData>({});
  const [error, setError] = useState('');

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

  const handleSendToMonday = async () => {
    setIsLoading(true);
    setError('');
    try {
      // TODO: call your Monday API with { schemaType: state!.schemaType, data: editedData }
      await new Promise(res => setTimeout(res, 800));
      // eslint-disable-next-line no-console
      console.log('Sending to Monday.com:', {
        schemaType: state!.schemaType,
        data: editedData,
      });
      alert('Data successfully sent to Monday.com!');
      navigate('/');
    } catch {
      setError('Failed to send data to Monday.com');
    } finally {
      setIsLoading(false);
    }
  };

  const Field = ({
    label,
    value,
    onChange,
  }: { label: string; value?: string; onChange: (v: string) => void }) => {
    const multiline = isMultilineKey(label);
    return (
      <div className="space-y-1">
        <label className="block text-[10px] font-semibold tracking-wide text-gray-600">
          {fmtKey(label)}
        </label>
        {multiline ? (
          <textarea
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            className="w-full rounded border border-gray-300 p-2 text-sm text-gray-800 focus:outline-none focus:ring-2"
            style={{ outlineColor: PRIMARY }}
          />
        ) : (
          <input
            type="text"
            value={value ?? ''}
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

  // Field order per schema (unchanged, just memo'd)
  const ORDER: Partial<Record<SchemaType, string[]>> = useMemo(() => ({
    [SchemaType.NETWORK]: [
      'Name','Title','Company','Email','Phone','LinkedIn',
      'Status','Country','State','City','Date','Date (Last Met)','Date (Last Contact)','Notes'
    ],
    [SchemaType.DEAL_FLOW]: [
      'Company name','CEO/ Primary Contact','Email','Date Sourced','Revenue Run Rate',
      'Financing Round','Evaluation','State','City','Referral Source','Name of Referral',
      'Sourced By','DEI','Equity/ Debt','Files','Notes'
    ],
    [SchemaType.LP_MAIN_DASHBOARD]: [
      'Name','Fund','Amount $','Email','Status','Country','State','City',
      'Follow Up date','Upcoming Meeting','Last Reach Out','Sent Email?','Notes'
    ],
    [SchemaType.VC_FUND]: [
      'Name','Stage','Date','Name of Contact','Title','Email','Phone',
      'Country','State','Industry Focus','Check Size','LinkedIn','Notes'
    ],
  }), []);

  const renderFlatObjectOrdered = (obj: Record<string, any>, order?: string[]) => {
    const presentKeys = new Set(Object.keys(obj ?? {}));
    const ordered = (order ?? []).filter(k => presentKeys.has(k));
    const rest = Array.from(presentKeys).filter(k => !ordered.includes(k)).sort();
    const finalKeys = [...ordered, ...rest];

    return (
      <div className="grid gap-3 md:grid-cols-2">
        {finalKeys.map((k) => (
          <Field key={k} label={k} value={obj[k]} onChange={(v) => setField(k, v)} />
        ))}
      </div>
    );
  };

  if (!state?.extractedData) {
    return <div className="p-4 text-sm text-gray-600">Loading...</div>;
  }

  const schemaType = state.schemaType;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-800 hover:bg-gray-50"
          >
            ← Back
          </button>
          <h1 className="text-base font-semibold" style={{ color: PRIMARY }}>Review Data</h1>
        </div>
      </div>

      {/* Editor */}
      <div className="space-y-6">
        {schemaType === SchemaType.NETWORK && (
          <SectionCard title="Network">
            {renderFlatObjectOrdered(editedData as NetworkPayload, ORDER[SchemaType.NETWORK])}
          </SectionCard>
        )}

        {schemaType === SchemaType.DEAL_FLOW && (
          <SectionCard title="Deal Flow">
            {renderFlatObjectOrdered(editedData as DealFlowPayload, ORDER[SchemaType.DEAL_FLOW])}
          </SectionCard>
        )}

        {schemaType === SchemaType.LP_MAIN_DASHBOARD && (
          <SectionCard title="LP Main Dashboard">
            {renderFlatObjectOrdered(editedData as LPMainDashboardPayload, ORDER[SchemaType.LP_MAIN_DASHBOARD])}
          </SectionCard>
        )}

        {schemaType === SchemaType.VC_FUND && (
          <SectionCard title="VC Fund">
            {renderFlatObjectOrdered(editedData as VCFundPayload, ORDER[SchemaType.VC_FUND])}
          </SectionCard>
        )}
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
