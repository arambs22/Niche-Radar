import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { TrendChart } from "./TrendChart";
import { RelatedQueriesList } from "./RelatedQueriesList";
import { api } from "../lib/api";
import type { Keyword, KeywordHistoryEntry, KeywordHistoryTrends, KeywordHistoryRelated } from "../lib/types";

interface HistoryDetailModalProps {
  entry: KeywordHistoryEntry;
  onClose: () => void;
  onRestored: (restored: Keyword) => void;
}

/** Detail view for one history entry: full multi-region trend chart, related queries, and — if archived — a restore action. */
export function HistoryDetailModal({ entry, onClose, onRestored }: HistoryDetailModalProps) {
  const [trends, setTrends] = useState<KeywordHistoryTrends | null>(null);
  const [related, setRelated] = useState<KeywordHistoryRelated | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<KeywordHistoryTrends>(`/keywords/${entry.id}/trends`),
      api.get<KeywordHistoryRelated>(`/keywords/${entry.id}/related`),
    ]).then(([t, r]) => {
      setTrends(t);
      setRelated(r);
    });
  }, [entry.id]);

  async function handleRestore() {
    setRestoring(true);
    try {
      const restored = await api.patch<Keyword>(`/keywords/${entry.id}/restore`, {});
      onRestored(restored);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Modal title={entry.term} onClose={onClose}>
      {!trends || !related ? (
        <p className="text-sm text-text-muted">Cargando...</p>
      ) : (
        <div className="space-y-4">
          <div className="h-64">
            <TrendChart series={trends.series} />
          </div>
          <RelatedQueriesList columns={related.columns} />
          {entry.removedAt && (
            <button
              type="button"
              onClick={handleRestore}
              disabled={restoring}
              className="w-full rounded bg-primary py-2 text-sm font-medium text-surface hover:bg-primary-hover disabled:opacity-50"
            >
              {restoring ? "Restaurando..." : "Restaurar"}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
