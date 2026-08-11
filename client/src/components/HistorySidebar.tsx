import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { getRegionLabel } from "../lib/regions";
import type { KeywordHistoryEntry } from "../lib/types";
import { HistoryDetailModal } from "./HistoryDetailModal";

const RETENTION_OPTIONS = [15, 30, 60, 90];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface HistorySidebarProps {
  initialRetentionDays: number;
}

function daysRemaining(removedAt: string, retentionDays: number): number {
  const deadlineMs = new Date(removedAt).getTime() + retentionDays * MS_PER_DAY;
  return Math.max(0, Math.ceil((deadlineMs - Date.now()) / MS_PER_DAY));
}

/** Hover-activated sidebar listing every keyword the user has ever tracked, active or archived, filterable by region. */
export function HistorySidebar({ initialRetentionDays }: HistorySidebarProps) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<KeywordHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [regionFilter, setRegionFilter] = useState("");
  const [retentionDays, setRetentionDays] = useState(initialRetentionDays);
  const [detailId, setDetailId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .get<KeywordHistoryEntry[]>("/keywords?includeRemoved=true")
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [open]);

  async function handleRetentionChange(days: number) {
    setRetentionDays(days);
    await api.patch("/auth/me", { historyRetentionDays: days });
  }

  const allRegions = Array.from(new Set(entries.flatMap((e) => e.regions)));
  const filtered = regionFilter ? entries.filter((e) => e.regions.includes(regionFilter)) : entries;
  const detailEntry = entries.find((e) => e.id === detailId) ?? null;

  return (
    <>
      <div
        className="fixed right-0 top-1/2 z-40 -translate-y-1/2"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <div className="flex items-center justify-center rounded-l-lg border border-r-0 border-border bg-surface px-1.5 py-3 text-text-muted">
          🕒
        </div>
        <div
          className={`absolute right-full top-1/2 w-72 -translate-y-1/2 rounded-lg border border-border bg-surface p-4 shadow-2xl transition-all duration-200 ${
            open ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-4 opacity-0"
          }`}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-text">Historial</h2>
            <select
              value={retentionDays}
              onChange={(e) => handleRetentionChange(Number(e.target.value))}
              className="rounded border border-border bg-bg px-1.5 py-1 text-xs text-text"
            >
              {RETENTION_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  {days} días
                </option>
              ))}
            </select>
          </div>
          {allRegions.length > 0 && (
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="mb-3 w-full rounded border border-border bg-bg px-2 py-1 text-xs text-text"
            >
              <option value="">Todas las regiones</option>
              {allRegions.map((code) => (
                <option key={code} value={code}>
                  {getRegionLabel(code)}
                </option>
              ))}
            </select>
          )}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="text-xs text-text-muted">Cargando...</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-text-muted">Sin keywords en tu historial.</p>
            ) : (
              <ul className="space-y-2">
                {filtered.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setDetailId(entry.id)}
                      className="w-full rounded border border-border bg-bg px-2 py-1.5 text-left hover:border-primary"
                    >
                      <p className="text-sm text-text">{entry.term}</p>
                      <p className="text-xs text-text-muted">
                        {entry.removedAt
                          ? `Archivada — expira en ${daysRemaining(entry.removedAt, retentionDays)} días`
                          : "Activa"}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      {detailEntry && (
        <HistoryDetailModal
          entry={detailEntry}
          onClose={() => setDetailId(null)}
          onRestored={(restored) => {
            setEntries((prev) =>
              prev.map((e) => (e.id === restored.id ? { ...e, removedAt: restored.removedAt } : e))
            );
            setDetailId(null);
          }}
        />
      )}
    </>
  );
}
