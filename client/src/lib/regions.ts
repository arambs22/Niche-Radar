export interface Region {
  code: string;
  label: string;
}

/** Matches the empty-geo convention already used by GET /api/trends and npm run collect. */
export const WORLDWIDE_LABEL = "Worldwide";

export const REGION_CATALOG: Region[] = [
  { code: "US", label: "Estados Unidos" },
  { code: "CA", label: "Canadá" },
  { code: "GB", label: "Reino Unido" },
  { code: "AU", label: "Australia" },
  { code: "DE", label: "Alemania" },
  { code: "FR", label: "Francia" },
  { code: "ES", label: "España" },
  { code: "IT", label: "Italia" },
  { code: "NL", label: "Países Bajos" },
  { code: "MX", label: "México" },
  { code: "BR", label: "Brasil" },
  { code: "AR", label: "Argentina" },
  { code: "CO", label: "Colombia" },
  { code: "CL", label: "Chile" },
  { code: "PT", label: "Portugal" },
  { code: "IE", label: "Irlanda" },
  { code: "SE", label: "Suecia" },
  { code: "NO", label: "Noruega" },
  { code: "DK", label: "Dinamarca" },
  { code: "FI", label: "Finlandia" },
  { code: "PL", label: "Polonia" },
  { code: "CH", label: "Suiza" },
  { code: "AT", label: "Austria" },
  { code: "BE", label: "Bélgica" },
  { code: "JP", label: "Japón" },
  { code: "KR", label: "Corea del Sur" },
  { code: "IN", label: "India" },
  { code: "SG", label: "Singapur" },
  { code: "NZ", label: "Nueva Zelanda" },
  { code: "ZA", label: "Sudáfrica" },
];

/** Resolves a region code to its display label; "" is Worldwide, unrecognized codes fall back to the raw code. */
export function getRegionLabel(code: string): string {
  if (code === "") return WORLDWIDE_LABEL;
  return REGION_CATALOG.find((r) => r.code === code)?.label ?? code;
}

/** CSS custom properties assigned to simultaneously active regions, by position in the active list (max 3). */
export const SERIES_COLORS = ["var(--color-primary)", "var(--color-series-2)", "var(--color-series-3)"] as const;
