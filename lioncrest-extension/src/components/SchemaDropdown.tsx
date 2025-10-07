import { SchemaType, SchemaTypeLabels } from '../types';

type Props = {
  value: SchemaType | "";
  onChange: (val: SchemaType) => void;
};

export default function SchemaDropdown({ value, onChange }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SchemaType)}
      className="w-full border border-gray-300 rounded p-2 text-gray-700"
    >

      {(Object.keys(SchemaTypeLabels) as SchemaType[]).map((key) => (
        <option key={key} value={key}>
          {SchemaTypeLabels[key]}
        </option>
      ))}
    </select>
  );
}
