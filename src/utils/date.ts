/**
 * Returns today's date as YYYY-MM-DD in the local timezone of the
 * running process (not UTC).
 *
 * Uses the "en-CA" locale, which formats dates as YYYY-MM-DD by
 * default, matching the format used throughout the database.
 */
export function getTodayLocal(): string {
  return new Date().toLocaleDateString("en-CA");
}