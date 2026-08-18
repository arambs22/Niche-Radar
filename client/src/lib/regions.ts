export interface Region {
  code: string;
}

/** Fixed catalog of region codes offered in the picker; display labels live in the i18n dictionary (see lib/i18n.ts). */
export const REGION_CATALOG: Region[] = [
  { code: "US" },
  { code: "CA" },
  { code: "GB" },
  { code: "AU" },
  { code: "DE" },
  { code: "FR" },
  { code: "ES" },
  { code: "IT" },
  { code: "NL" },
  { code: "MX" },
  { code: "BR" },
  { code: "AR" },
  { code: "CO" },
  { code: "CL" },
  { code: "PT" },
  { code: "IE" },
  { code: "SE" },
  { code: "NO" },
  { code: "DK" },
  { code: "FI" },
  { code: "PL" },
  { code: "CH" },
  { code: "AT" },
  { code: "BE" },
  { code: "JP" },
  { code: "KR" },
  { code: "IN" },
  { code: "SG" },
  { code: "NZ" },
  { code: "ZA" },
];

/** CSS custom properties assigned to simultaneously active regions, by position in the active list (max 3). */
export const SERIES_COLORS = ["var(--color-primary)", "var(--color-series-2)", "var(--color-series-3)"] as const;
