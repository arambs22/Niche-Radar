import { useEffect, useState } from "react";
import { Navbar } from "../components/Navbar";
import { KeywordForm } from "../components/KeywordForm";
import { KeywordList } from "../components/KeywordList";
import { GeoInput } from "../components/GeoInput";
import { TrendChart } from "../components/TrendChart";
import { RelatedQueriesList } from "../components/RelatedQueriesList";
import { api } from "../lib/api";
import type { Keyword, KeywordTrend, KeywordRelated } from "../lib/types";

/** Protected landing page: keyword management plus trend chart and related queries for the selected keyword. */
export function DashboardPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [trends, setTrends] = useState<KeywordTrend[]>([]);
  const [related, setRelated] = useState<KeywordRelated[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [geo, setGeo] = useState(() => localStorage.getItem("nicheradar_geo") ?? "");
  const [loadingKeywords, setLoadingKeywords] = useState(true);
  const [loadingTrends, setLoadingTrends] = useState(true);

  useEffect(() => {
    localStorage.setItem("nicheradar_geo", geo);
  }, [geo]);

  function refetchKeywords() {
    return api.get<Keyword[]>("/keywords").then((res) => {
      setKeywords(res);
      setSelectedId((prev) => prev ?? res[0]?.id ?? null);
      return res;
    });
  }

  useEffect(() => {
    refetchKeywords().finally(() => setLoadingKeywords(false));
  }, []);

  useEffect(() => {
    setLoadingTrends(true);
    Promise.all([
      api.get<KeywordTrend[]>(`/trends?geo=${encodeURIComponent(geo)}`),
      api.get<KeywordRelated[]>(`/related?geo=${encodeURIComponent(geo)}`),
    ])
      .then(([trendsRes, relatedRes]) => {
        setTrends(trendsRes);
        setRelated(relatedRes);
      })
      .finally(() => setLoadingTrends(false));
  }, [geo]);

  useEffect(() => {
    if (selectedId !== null && !keywords.some((k) => k.id === selectedId)) {
      setSelectedId(keywords[0]?.id ?? null);
    }
  }, [keywords, selectedId]);

  const selectedTrend = trends.find((t) => t.id === selectedId);
  const selectedRelated = related.find((r) => r.id === selectedId);

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8 md:grid-cols-[minmax(0,320px)_1fr]">
        <div className="space-y-4">
          <KeywordForm onCreated={refetchKeywords} />
          <GeoInput value={geo} onChange={setGeo} />
          {loadingKeywords ? (
            <p className="text-sm text-text-muted">Cargando keywords...</p>
          ) : (
            <KeywordList
              keywords={keywords}
              onDeleted={refetchKeywords}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>
        <div className="space-y-6 rounded-lg border border-border bg-surface p-6 shadow-sm">
          {selectedId === null ? (
            <p className="text-sm text-text-muted">Agrega o selecciona una keyword para ver su tendencia.</p>
          ) : loadingTrends ? (
            <p className="text-sm text-text-muted">Cargando datos de tendencia...</p>
          ) : (
            <>
              <div>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Tendencia</h2>
                <TrendChart timeline={selectedTrend?.timeline ?? []} />
              </div>
              <div>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Related queries en alza</h2>
                <RelatedQueriesList rising={selectedRelated?.rising ?? []} />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
