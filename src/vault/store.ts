// The vault store: the chosen folder, every note in it, and write permission.
// All edits go through write(), which updates the notes list so every tab re-renders.

import { create } from "zustand";
import { idbGet, idbSet } from "../lib/storage";
import { noteFromPath, readFile, scanVault, writeFile } from "./fs";
import type { DiskFile, Note } from "./types";

export type VaultStatus =
  | "init"          // checking for a remembered folder
  | "unsupported"   // browser can't open local folders
  | "disconnected"  // no folder chosen yet
  | "reconnect"     // remembered folder needs a click to re-allow access
  | "loading"       // reading notes
  | "ready"
  | "error";

interface VaultState {
  status: VaultStatus;
  handle: FileSystemDirectoryHandle | null;
  notes: Note[];
  canWrite: boolean;
  progress: number;
  error: string | null;

  init: () => Promise<void>;
  pick: () => Promise<void>;
  reconnect: () => Promise<void>;
  refresh: () => Promise<void>;
  checkWrite: () => Promise<boolean>;
  requestWrite: () => Promise<boolean>;
  read: (path: string) => Promise<DiskFile>;
  write: (path: string, text: string, opts?: { createFolder?: boolean; crlf?: boolean }) => Promise<number>;
}

export const supportsFolderAccess = (): boolean =>
  typeof window !== "undefined" && "showDirectoryPicker" in window;

let initStarted = false;

/** Merge a fresh scan with the current list, keeping any note we wrote more recently than the scan saw. */
function mergeScan(current: Note[], scanned: Note[]): Note[] {
  const byPath = new Map(current.map((n) => [n.path, n]));
  return scanned.map((n) => {
    const mine = byPath.get(n.path);
    return mine && mine.mtime > n.mtime ? mine : n;
  });
}

export const useVault = create<VaultState>()((set, get) => ({
  status: "init",
  handle: null,
  notes: [],
  canWrite: false,
  progress: 0,
  error: null,

  async init() {
    if (initStarted) return; // React StrictMode runs effects twice in development
    initStarted = true;

    if (!supportsFolderAccess()) return set({ status: "unsupported" });

    const saved = await idbGet<FileSystemDirectoryHandle>("vault");
    if (!saved) return set({ status: "disconnected" });

    set({ handle: saved });
    let perm: PermissionState = "prompt";
    try {
      perm = await saved.queryPermission({ mode: "read" });
    } catch {
      /* treat as needing a click */
    }
    if (perm === "granted") await get().refresh();
    else set({ status: "reconnect" });
  },

  async pick() {
    try {
      const handle = await window.showDirectoryPicker({ id: "obsidian-vault", mode: "readwrite" });
      void idbSet("vault", handle); // remember it in the background; never block loading on it
      set({ handle, notes: [] });
      await get().refresh();
    } catch (e) {
      if ((e as Error).name !== "AbortError") set({ status: "error", error: (e as Error).message });
    }
  },

  async reconnect() {
    const handle = get().handle;
    if (!handle) return;
    try {
      const perm = await handle.requestPermission({ mode: "readwrite" });
      if (perm === "granted" || (await handle.queryPermission({ mode: "read" })) === "granted") {
        await get().refresh();
      }
    } catch {
      set({ status: "disconnected" });
    }
  },

  async refresh() {
    const handle = get().handle;
    if (!handle) return;
    if (get().status !== "ready") set({ status: "loading", progress: 0 });
    try {
      const scanned = await scanVault(handle, (n) => {
        if (get().status === "loading") set({ progress: n });
      });
      set({ notes: mergeScan(get().notes, scanned), status: "ready", error: null });
      await get().checkWrite();
    } catch (e) {
      set({ status: "error", error: (e as Error).message });
    }
  },

  async checkWrite() {
    const handle = get().handle;
    let ok = false;
    try {
      ok = !!handle && (await handle.queryPermission({ mode: "readwrite" })) === "granted";
    } catch {
      ok = false;
    }
    set({ canWrite: ok });
    return ok;
  },

  async requestWrite() {
    const handle = get().handle;
    let ok = false;
    try {
      ok = !!handle && (await handle.requestPermission({ mode: "readwrite" })) === "granted";
    } catch {
      ok = false;
    }
    set({ canWrite: ok });
    return ok;
  },

  read(path) {
    const handle = get().handle;
    if (!handle) return Promise.reject(new Error("No vault connected"));
    return readFile(handle, path);
  },

  async write(path, text, opts) {
    const handle = get().handle;
    if (!handle) throw new Error("No vault connected");
    const mtime = await writeFile(handle, path, text, opts);

    set((s) => {
      const i = s.notes.findIndex((n) => n.path === path);
      const notes = [...s.notes];
      if (i >= 0) notes[i] = { ...notes[i], text, mtime };
      else {
        notes.push(noteFromPath(path, text, mtime));
        notes.sort((a, b) => a.path.localeCompare(b.path));
      }
      return { notes };
    });
    return mtime;
  },
}));

/** Test helper: reset the store between tests. */
export function resetVaultForTests(): void {
  initStarted = false;
  useVault.setState({ status: "init", handle: null, notes: [], canWrite: false, progress: 0, error: null });
}
