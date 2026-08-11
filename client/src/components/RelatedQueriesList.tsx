import { useState } from "react";
import type { RelatedQuery } from "../lib/types";
import { getRegionLabel } from "../lib/regions";
import { Modal } from "./Modal";

export interface RegionRelated {
  region: string;
  rising: RelatedQuery[];
}

interface RelatedQueriesListProps {
  columns: RegionRelated[];
}

const GRID_COLS_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
};

const VISIBLE_LIMIT = 5;

function QueryRow({ item }: { item: RelatedQuery }) {
  return (
    <li className="flex justify-between text-sm">
      <span className="text-text">{item.query}</span>
      <span className="font-mono font-medium text-rise">{item.growthValue}</span>
    </li>
  );
}

/** Lists a keyword's rising related search queries, one column per active region, truncated with a "view all" modal. */
export function RelatedQueriesList({ columns }: RelatedQueriesListProps) {
  const [expandedRegion, setExpandedRegion] = useState<string | null>(null);

  const hasAny = columns.some((c) => c.rising.length > 0);
  if (!hasAny) {
    return <p className="text-sm text-text-muted">Sin related queries en alza todavía.</p>;
  }

  const expanded = columns.find((c) => c.region === expandedRegion) ?? null;

  return (
    <>
      <div className={`grid gap-4 ${GRID_COLS_CLASS[columns.length] ?? "grid-cols-1"}`}>
        {columns.map(({ region, rising }) => (
          <div key={region}>
            {columns.length > 1 && (
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                {getRegionLabel(region)}
              </p>
            )}
            {rising.length === 0 ? (
              <p className="text-sm text-text-muted">Sin datos.</p>
            ) : (
              <>
                <ul className="space-y-1">
                  {rising.slice(0, VISIBLE_LIMIT).map((item) => (
                    <QueryRow key={item.query} item={item} />
                  ))}
                </ul>
                {rising.length > VISIBLE_LIMIT && (
                  <button
                    type="button"
                    onClick={() => setExpandedRegion(region)}
                    className="mt-1 text-xs font-medium text-primary hover:underline"
                  >
                    Ver todas (+{rising.length - VISIBLE_LIMIT})
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      {expanded && (
        <Modal title={`Related queries — ${getRegionLabel(expanded.region)}`} onClose={() => setExpandedRegion(null)}>
          <ul className="space-y-1">
            {expanded.rising.map((item) => (
              <QueryRow key={item.query} item={item} />
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}
