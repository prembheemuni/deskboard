// localStorage helpers that never throw. Settings are per browser.

export const KEYS = {
  sessions: "deskPomodoroSessions",
  activeTab: "deskActiveTab",
  dailyFolder: "deskDailyFolder",
  openFolders: "deskVaultOpenFolders",
  sideCollapsed: "deskVaultSideCollapsed",
} as const;

export function readString(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked: settings just won't persist */
  }
}

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  writeString(key, JSON.stringify(value));
}
