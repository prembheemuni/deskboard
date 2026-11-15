// localStorage + IndexedDB helpers that never throw.
//
// The keys deliberately match the old single-file dashboard (prodo.html).
// Browsers treat every file:// page as the same site, so when the built
// dist/index.html is opened from disk it picks up the old settings, the
// focus-session count and the remembered vault folder automatically.

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

// ---- IndexedDB: a tiny key/value store (used to remember the vault folder handle)

const DB_NAME = "deskObsidian";
const STORE = "kv";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Give up after this long: IndexedDB can hang in some private/locked-down browser modes. */
const IDB_TIMEOUT = 3000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    return await withTimeout(
      openDB().then(
        (db) =>
          new Promise<T | undefined>((resolve, reject) => {
            const req = db.transaction(STORE).objectStore(STORE).get(key);
            req.onsuccess = () => resolve(req.result as T | undefined);
            req.onerror = () => reject(req.error);
          }),
      ),
      IDB_TIMEOUT,
    );
  } catch {
    return undefined;
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await withTimeout(openDB(), IDB_TIMEOUT);
    db?.transaction(STORE, "readwrite").objectStore(STORE).put(value, key);
  } catch {
    /* ignore: the folder just won't be remembered */
  }
}
