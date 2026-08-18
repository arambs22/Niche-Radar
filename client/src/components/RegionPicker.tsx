import { useEffect, useRef } from "react";
import { REGION_CATALOG } from "../lib/regions";
import { useLanguage } from "../context/LanguageContext";
import { regionLabel } from "../lib/i18n";

interface RegionPickerProps {
  excluding: string[];
  onPick: (code: string) => void;
  onClose: () => void;
}

/** Dropdown listing the fixed region catalog, excluding regions already added as tabs. Closes on an outside click. */
export function RegionPicker({ excluding, onPick, onClose }: RegionPickerProps) {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const available = REGION_CATALOG.filter((r) => !excluding.includes(r.code));

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className="absolute top-full left-0 z-10 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-border bg-surface shadow-sm"
    >
      <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface px-2 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t.regionPicker.header}</span>
        <button type="button" onClick={onClose} aria-label={t.regionPicker.close} className="text-text-muted hover:text-primary">
          ×
        </button>
      </div>
      {available.length === 0 ? (
        <p className="px-2 py-2 text-sm text-text-muted">{t.regionPicker.allAdded}</p>
      ) : (
        <ul className="p-2 pt-1">
          {available.map((region) => (
            <li key={region.code}>
              <button
                type="button"
                onClick={() => onPick(region.code)}
                className="w-full rounded px-2 py-1 text-left text-sm text-text hover:bg-bg"
              >
                {regionLabel(t, region.code)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
