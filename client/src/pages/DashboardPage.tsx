import { useEffect, useState } from "react";
import { Navbar } from "../components/Navbar";
import { KeywordForm } from "../components/KeywordForm";
import { KeywordList } from "../components/KeywordList";
import { RegionTabs } from "../components/RegionTabs";
import { TrendChart } from "../components/TrendChart";
import { RelatedQueriesList } from "../components/RelatedQueriesList";
import { HistorySidebar } from "../components/HistorySidebar";
import { useAuth } from "../context/AuthContext";
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

/** Protected landing page, filling the viewport with no page-level scroll: keyword management plus trend chart and related queries, compared across up to 3 active regions. */
export function DashboardPage() {
  const { user } = useAuth();
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
    <div className="flex min-h-screen flex-col bg-bg">
      <Navbar />
      <main className="flex flex-1 flex-col gap-4 px-6 py-4">
        <RegionTabs
          added={addedRegions}
          active={activeRegions}
          onToggle={handleToggleActive}
          onRemove={handleRemoveRegion}
          onAdd={handleAddRegion}
        />
        <div className="grid min-h-[480px] flex-1 gap-6 md:grid-cols-[320px_1fr]">
          <div className="flex min-h-0 flex-col gap-4">
            <KeywordForm onCreated={refetchKeywords} />
            <div className="min-h-0 flex-1 overflow-y-auto">
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
          </div>
          <div className="min-h-0 rounded-lg border border-border bg-surface p-6 shadow-sm">
            {selectedId === null ? (
              <p className="flex h-full items-center justify-center text-center text-sm text-text-muted">
                Agrega o selecciona una keyword para ver su tendencia.
              </p>
            ) : activeRegions.length === 0 ? (
              <p className="flex h-full items-center justify-center text-center text-sm text-text-muted">
                Activa al menos una región para ver su tendencia.
              </p>
            ) : loadingTrends ? (
              <p className="flex h-full items-center justify-center text-center text-sm text-text-muted">
                Cargando datos de tendencia...
              </p>
            ) : (
              <div className="grid h-full grid-rows-[auto_1fr_auto_auto] gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Tendencia</h2>
                <div className="min-h-[260px]">
                  <TrendChart series={chartSeries} />
                </div>
                <h2 className="mt-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Related queries en alza
                </h2>
                <RelatedQueriesList columns={relatedColumns} />
              </div>
            )}
          </div>
        </div>
      </main>
      {user && <HistorySidebar initialRetentionDays={user.historyRetentionDays} />}
    </div>
  );
}
