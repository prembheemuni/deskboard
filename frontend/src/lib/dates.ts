// Dates are handled as local-time "keys" (YYYY-MM-DD), the same format as daily note file names.

const DAY = 86_400_000;

/** Local date as YYYY-MM-DD. */
export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Noon on the given key's day (noon avoids DST edge cases). */
export function keyToDate(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

function noonToday(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** The date `offset` days from today (0 = today, -1 = yesterday). */
export function dateFromOffset(offset: number, now: Date = new Date()): Date {
  const d = noonToday(now);
  d.setDate(d.getDate() + offset);
  return d;
}

/** Days between today and the key (negative = past). */
export function offsetOf(key: string, now: Date = new Date()): number {
  return Math.round((keyToDate(key).getTime() - noonToday(now).getTime()) / DAY);
}

export function relativeLabel(offset: number): string {
  if (offset === 0) return "TODAY";
  if (offset === -1) return "YESTERDAY";
  if (offset === 1) return "TOMORROW";
  return offset < 0 ? `${-offset} DAYS AGO` : `IN ${offset} DAYS`;
}

export function addDaysKey(key: string, days: number): string {
  const d = keyToDate(key);
  d.setDate(d.getDate() + days);
  return dayKey(d);
}

export const isDayKey = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);

const LOCALE = "en-IN";

export const formatLongDate = (key: string): string =>
  keyToDate(key).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "short", year: "numeric" });

export const formatShortDate = (key: string): string =>
  keyToDate(key).toLocaleDateString(LOCALE, { day: "numeric", month: "short" });

export const formatDayWithWeekday = (key: string): string =>
  keyToDate(key).toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export const formatDateTime = (ts: number): string =>
  new Date(ts).toLocaleString(LOCALE, {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });

export const formatClockTime = (d: Date = new Date()): string =>
  d.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false });
