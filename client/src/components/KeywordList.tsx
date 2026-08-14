import { api } from "../lib/api";
import { getRegionLabel } from "../lib/regions";
import type { Keyword } from "../lib/types";

interface KeywordListProps {
  keywords: Keyword[];
  activeRegions: string[];
  onChanged: () => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
}

function getBlockedRegions(keyword: Keyword, activeRegions: string[]): string[] {
  if (!keyword.collectionStatus) return [];
  return activeRegions.filter((geo) => keyword.collectionStatus?.[geo]?.blocked);
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/** Tooltip for the blocked indicator: one line per blocked region with its last attempt and how many attempts have failed in a row. */
function buildBlockedTooltip(keyword: Keyword, blockedRegions: string[]): string {
  const lines = blockedRegions.map((geo) => {
    const status = keyword.collectionStatus?.[geo];
    const label = getRegionLabel(geo);
    if (!status) return label;
    const attempts = `${status.consecutiveFailures} ${
      status.consecutiveFailures === 1 ? "intento fallido" : "intentos fallidos"
    }`;
    return `${label} — último intento: ${formatTimestamp(status.lastAttemptAt)}, ${attempts}`;
  });
  return `Google bloqueó la recolección en:\n${lines.join("\n")}`;
}

/** Lists the user's tracked keywords; click to select, pause/resume automatic collection, or archive individually. */
export function KeywordList({ keywords, activeRegions, onChanged, selectedId, onSelect }: KeywordListProps) {
  async function handleDelete(id: number) {
    await api.delete(`/keywords/${id}`);
    onChanged();
  }

  async function handleTogglePause(id: number, currentlyPaused: boolean) {
    await api.patch(`/keywords/${id}/auto-collect`, { paused: !currentlyPaused });
    onChanged();
  }

  if (keywords.length === 0) {
    return <p className="text-sm text-text-muted">Todavía no trackeas ninguna keyword.</p>;
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface shadow-sm">
      {keywords.map((keyword) => {
        const blockedRegions = getBlockedRegions(keyword, activeRegions);
        return (
          <li
            key={keyword.id}
            onClick={() => onSelect(keyword.id)}
            className={`flex cursor-pointer items-center justify-between gap-2 px-4 py-3 ${
              selectedId === keyword.id ? "bg-bg" : ""
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{keyword.term}</p>
                <p className="text-xs text-text-muted">{keyword.category}</p>
              </div>
              {blockedRegions.length > 0 && (
                <span
                  title={buildBlockedTooltip(keyword, blockedRegions)}
                  className="shrink-0 text-primary"
                >
                  ⚠
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleTogglePause(keyword.id, keyword.autoCollectPaused);
                }}
                className="text-text-muted hover:underline"
              >
                {keyword.autoCollectPaused ? "Reanudar" : "Pausar"}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(keyword.id);
                }}
                className="text-primary hover:underline"
              >
                Archivar
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
