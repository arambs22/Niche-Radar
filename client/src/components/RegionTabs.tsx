import { useState } from "react";
import { getRegionLabel, SERIES_COLORS } from "../lib/regions";
import { RegionPicker } from "./RegionPicker";

interface RegionTabsProps {
  added: string[];
  active: string[];
  onToggle: (code: string) => void;
  onRemove: (code: string) => void;
  onAdd: (code: string) => void;
}

/** Region tab bar: fixed Worldwide tab, one tab per added region, and a picker to add more (max 3 active at once). */
export function RegionTabs({ added, active, onToggle, onRemove, onAdd }: RegionTabsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  function tabClass(isActive: boolean) {
    return `flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
      isActive ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-text-muted"
    }`;
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => onToggle("")} className={tabClass(active.includes(""))}>
        {active.includes("") && (
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: SERIES_COLORS[active.indexOf("")] }}
          />
        )}
        Worldwide
      </button>
      {added.map((code) => {
        const isActive = active.includes(code);
        return (
          <span key={code} className={tabClass(isActive)}>
            <button type="button" onClick={() => onToggle(code)} className="flex items-center gap-1.5">
              {isActive && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: SERIES_COLORS[active.indexOf(code)] }}
                />
              )}
              {getRegionLabel(code)}
            </button>
            <button
              type="button"
              onClick={() => onRemove(code)}
              aria-label={`Quitar ${getRegionLabel(code)}`}
              className="text-text-muted hover:text-primary"
            >
              ×
            </button>
          </span>
        );
      })}
      <button
        type="button"
        onClick={() => setPickerOpen((prev) => !prev)}
        className="rounded-full border border-dashed border-border px-3 py-1 text-xs text-text-muted hover:border-primary hover:text-primary"
      >
        + Región
      </button>
      {pickerOpen && (
        <RegionPicker
          excluding={added}
          onPick={(code) => {
            onAdd(code);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
