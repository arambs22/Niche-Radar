import { REGION_CATALOG } from "../lib/regions";

interface RegionPickerProps {
  excluding: string[];
  onPick: (code: string) => void;
  onClose: () => void;
}

/** Dropdown listing the fixed region catalog, excluding regions already added as tabs. */
export function RegionPicker({ excluding, onPick, onClose }: RegionPickerProps) {
  const available = REGION_CATALOG.filter((r) => !excluding.includes(r.code));

  return (
    <div className="absolute top-full left-0 z-10 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-border bg-surface p-2 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Agregar región</span>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="text-text-muted hover:text-primary">
          ×
        </button>
      </div>
      {available.length === 0 ? (
        <p className="px-2 py-1 text-sm text-text-muted">Ya agregaste todas las regiones disponibles.</p>
      ) : (
        <ul>
          {available.map((region) => (
            <li key={region.code}>
              <button
                type="button"
                onClick={() => onPick(region.code)}
                className="w-full rounded px-2 py-1 text-left text-sm text-text hover:bg-bg"
              >
                {region.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
