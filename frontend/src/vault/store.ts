// The vault store: every note in the vault, loaded from the Deskboard backend.
// All edits go through write(), which updates the notes list so every tab re-renders.

import { create } from "zustand";
import { OfflineError, api, subscribeChanges, type FileChange } from "../api/client";
import type { DiskFile, Note } from "./types";

export type VaultStatus =
  | "init"           // first load
  | "offline"        // the backend isn't running
  | "not_configured" // the backend has no vault folder set
  | "missing"        // the vault folder set on the backend can't be found
  | "loading"        // reading notes
  | "ready"
  | "error";

export interface WriteOptions {
  createFolder?: boolean;
  crlf?: boolean;
  /** The version this edit is based on: the write fails with ConflictError if the note changed since. */
  base?: { text: string; mtime: number };
}

interface VaultState {
  status: VaultStatus;
  /** Vault folder name (used for obsidian:// links) */
  name: string;
  /** Vault folder on the server's disk */
  path: string;
  notes: Note[];
  error: string | null;

  init: () => Promise<void>;
  refresh: () => Promise<void>;
  read: (path: string) => Promise<DiskFile>;
  write: (path: string, text: string, opts?: WriteOptions) => Promise<number>;
  /** Apply changes reported by the server's file watcher */
  applyChanges: (changes: FileChange[]) => Promise<void>;
}

const byPath = (a: Note, b: Note) => a.path.localeCompare(b.path);

/** Merge a fresh list with the current one, keeping any note we wrote more recently than the list saw. */
function mergeScan(current: Note[], scanned: Note[]): Note[] {
  const mine = new Map(current.map((n) => [n.path, n]));
  return scanned.map((n) => {
    const m = mine.get(n.path);
    return m && m.mtime > n.mtime ? m : n;
  });
}

function upsert(notes: Note[], note: Note): Note[] {
  const i = notes.findIndex((n) => n.path === note.path);
  if (i >= 0) {
    if (notes[i].mtime >= note.mtime && notes[i].text === note.text) return notes;
    const next = [...notes];
    next[i] = note;
    return next;
  }
  return [...notes, note].sort(byPath);
}

function noteFromPath(path: string, text: string, mtime: number): Note {
  const parts = path.split("/");
  const file = parts.pop() ?? "";
  return { path, name: file.replace(/\.md$/, ""), folder: parts.join("/"), text, mtime };
}

let initStarted = false;
let unsubscribe: (() => void) | null = null;

export const useVault = create<VaultState>()((set, get) => ({
  status: "init",
  name: "",
  path: "",
  notes: [],
  error: null,

  async init() {
    if (initStarted) return; // React StrictMode runs effects twice in development
    initStarted = true;
    unsubscribe = subscribeChanges(
      (changes) => void get().applyChanges(changes),
      () => void get().refresh(),
    );
    await get().refresh();
  },

  async refresh() {
    try {
      const info = await api.vault();
      set({ name: info.name ?? "", path: info.path ?? "" });
      if (info.status !== "ready") return set({ status: info.status, notes: [], error: null });

      if (get().status !== "ready") set({ status: "loading" });
      const scanned = (await api.notes()).sort(byPath);
      set({ notes: mergeScan(get().notes, scanned), status: "ready", error: null });
    } catch (e) {
      if (e instanceof OfflineError) set({ status: "offline", error: e.message });
      else set({ status: "error", error: (e as Error).message });
    }
  },

  read: (path) => api.read(path),

  async write(path, text, opts = {}) {
    const mtime = await api.write({ path, text, ...opts });
    set((s) => ({ notes: upsert(s.notes, noteFromPath(path, text, mtime)) }));
    return mtime;
  },

  async applyChanges(changes) {
    if (get().status !== "ready") return;
    for (const c of changes) {
      if (c.kind === "deleted") {
        set((s) => ({ notes: s.notes.filter((n) => n.path !== c.path) }));
        continue;
      }
      try {
        const disk = await api.read(c.path);
        if (!disk.exists) continue;
        const current = get().notes.find((n) => n.path === c.path);
        // our own saves come back as events too: nothing new in them
        if (current && current.mtime >= disk.mtime) continue;
        set((s) => ({ notes: upsert(s.notes, noteFromPath(c.path, disk.text, disk.mtime)) }));
      } catch {
        /* the next change or refresh will pick it up */
      }
    }
  },
}));

/** Test helper: reset the store between tests. */
export function resetVaultForTests(): void {
  initStarted = false;
  unsubscribe?.();
  unsubscribe = null;
  useVault.setState({ status: "init", name: "", path: "", notes: [], error: null });
}
