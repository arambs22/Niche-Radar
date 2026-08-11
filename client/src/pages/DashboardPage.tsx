import { useEffect, useState } from "react";
import { Navbar } from "../components/Navbar";
import { KeywordForm } from "../components/KeywordForm";
import { KeywordList } from "../components/KeywordList";
import { RegionTabs } from "../components/RegionTabs";
import { TrendChart } from "../components/TrendChart";
import { RelatedQueriesList } from "../components/RelatedQueriesList";
import { api } from "../lib/api";
import type { Keyword, KeywordTrend, KeywordRelated } from "../lib/types";

function loadRegionList(key: string, fallback: string[]): string[] {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** Protected landing page: keyword management plus trend chart and related queries, compared across up to 3 active regions. */
export function DashboardPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addedRegions, setAddedRegions] = useState<string[]>(() => loadRegionList("nicheradar_regions_added", []));
  const [activeRegions, setActiveRegions] = useState<string[]>(() => loadRegionList("nicheradar_regions_active", [""]));
  const [trendsByRegion, setTrendsByRegion] = useState<Record<string, KeywordTrend[]>>({});
  const [relatedByRegion, setRelatedByRegion] = useState<Record<string, KeywordRelated[]>>({});
  const [loadingKeywords, setLoadingKeywords] = useState(true);
  const [loadingTrends, setLoadingTrends] = useState(true);

  useEffect(() => {
    localStorage.setItem("nicheradar_regions_added", JSON.stringify(addedRegions));
  }, [addedRegions]);

  useEffect(() => {
    localStorage.setItem("nicheradar_regions_active", JSON.stringify(activeRegions));
  }, [activeRegions]);

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
    Promise.all(
      activeRegions.map((region) =>
        Promise.all([
          api.get<KeywordTrend[]>(`/trends?geo=${encodeURIComponent(region)}`),
          api.get<KeywordRelated[]>(`/related?geo=${encodeURIComponent(region)}`),
        ]).then(([trends, related]) => ({ region, trends, related }))
      )
    )
      .then((results) => {
        const nextTrends: Record<string, KeywordTrend[]> = {};
        const nextRelated: Record<string, KeywordRelated[]> = {};
        for (const { region, trends, related } of results) {
          nextTrends[region] = trends;
          nextRelated[region] = related;
        }
        setTrendsByRegion(nextTrends);
        setRelatedByRegion(nextRelated);
      })
      .finally(() => setLoadingTrends(false));
  }, [activeRegions]);

  useEffect(() => {
    if (selectedId !== null && !keywords.some((k) => k.id === selectedId)) {
      setSelectedId(keywords[0]?.id ?? null);
    }
  }, [keywords, selectedId]);

  function handleAddRegion(code: string) {
    setAddedRegions((prev) => (prev.includes(code) ? prev : [...prev, code]));
  }

  function handleRemoveRegion(code: string) {
    setAddedRegions((prev) => prev.filter((c) => c !== code));
    setActiveRegions((prev) => prev.filter((c) => c !== code));
  }

  function handleToggleActive(code: string) {
    setActiveRegions((prev) => {
      if (prev.includes(code)) {
        return prev.filter((c) => c !== code);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, code];
    });
  }

  const chartSeries = activeRegions.map((region) => ({
    region,
    timeline: trendsByRegion[region]?.find((t) => t.id === selectedId)?.timeline ?? [],
  }));

  const relatedColumns = activeRegions.map((region) => ({
    region,
    rising: relatedByRegion[region]?.find((r) => r.id === selectedId)?.rising ?? [],
  }));

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="mx-auto max-w-5xl space-y-4 px-6 py-8">
        <RegionTabs
          added={addedRegions}
          active={activeRegions}
          onToggle={handleToggleActive}
          onRemove={handleRemoveRegion}
          onAdd={handleAddRegion}
        />
        <div className="grid gap-6 md:grid-cols-[minmax(0,320px)_1fr]">
          <div className="space-y-4">
            <KeywordForm onCreated={refetchKeywords} />
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
            ) : activeRegions.length === 0 ? (
              <p className="text-sm text-text-muted">Activa al menos una región para ver su tendencia.</p>
            ) : loadingTrends ? (
              <p className="text-sm text-text-muted">Cargando datos de tendencia...</p>
            ) : (
              <>
                <div>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Tendencia</h2>
                  <TrendChart series={chartSeries} />
                </div>
                <div>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Related queries en alza</h2>
                  <RelatedQueriesList columns={relatedColumns} />
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
