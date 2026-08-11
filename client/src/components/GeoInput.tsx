interface GeoInputProps {
  value: string;
  onChange: (geo: string) => void;
}

/** Free-text region code input (e.g. "US"); empty means worldwide, matching `npm run collect`'s default. */
export function GeoInput({ value, onChange }: GeoInputProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-text" htmlFor="geo">Región (geo)</label>
      <input
        id="geo"
        value={value}
        onChange={(e) => onChange(e.target.value.trim().toUpperCase())}
        placeholder="US (vacío = worldwide)"
        className="mt-1 w-48 rounded border border-border bg-surface px-3 py-1.5 text-sm text-text"
      />
    </div>
  );
}
