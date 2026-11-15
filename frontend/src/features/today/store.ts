// Today tab: the daily note being edited, auto-save, and conflict handling.

import { create } from "zustand";
import type { AlertMessage, StatusMessage } from "../../components/types";
import { dateFromOffset, dayKey, formatClockTime } from "../../lib/dates";
import { KEYS, readString, writeString } from "../../lib/storage";
import { ConflictError, FolderMissingError } from "../../api/client";
import { useVault } from "../../vault/store";

export const DAILY_DEFAULT = "Daily Updates";
const SAVE_DELAY = 1000;

export const cleanFolder = (folder: string): string =>
  folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

export const dailyPath = (folder: string, key: string): string => {
  const f = cleanFolder(folder);
  return `${f ? `${f}/` : ""}${key}.md`;
};

function initialFolder(): string {
  const stored = readString(KEYS.dailyFolder, "");
  // the folder used to live under office/; it now sits at the top of the vault
  const folder = !stored || stored === "office/Daily Updates" ? DAILY_DEFAULT : stored;
  writeString(KEYS.dailyFolder, folder);
  return folder;
}

interface Base {
  text: string;
  mtime: number;
  exists: boolean;
}

interface TodayState {
  folder: string;
  /** 0 = today, -1 = yesterday … */
  offset: number;
  /** Date key of the loaded note, null until loaded */
  key: string | null;
  /** The note as last read from / written to disk */
  base: Base | null;
  /** Editor contents */
  text: string;
  dirty: boolean;
  saving: boolean;
  status: StatusMessage;
  alert: AlertMessage | null;

  path: () => string | null;
  setFolder: (folder: string) => Promise<void>;
  go: (offset: number) => Promise<void>;
  load: () => Promise<void>;
  setText: (text: string) => void;
  saveNow: (opts?: { overwrite?: boolean; createFolder?: boolean }) => Promise<void>;
  /** Save first if this path is open with unsaved typing (used before another tab edits it) */
  flush: (path: string) => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useToday = create<TodayState>()((set, get) => ({
  folder: initialFolder(),
  offset: 0,
  key: null,
  base: null,
  text: "",
  dirty: false,
  saving: false,
  status: { text: "" },
  alert: null,

  path() {
    const { key, folder } = get();
    return key ? dailyPath(folder, key) : null;
  },

  async setFolder(folder) {
    await get().saveNow();
    const next = folder.trim() || DAILY_DEFAULT;
    writeString(KEYS.dailyFolder, next);
    set({ folder: next, key: null, base: null });
    await get().load();
  },

  async go(offset) {
    set({ offset });
    await get().load();
  },

  async load() {
    const vault = useVault.getState();
    if (vault.status !== "ready") return;
    if (get().dirty) await get().saveNow();

    const key = dayKey(dateFromOffset(get().offset));
    let disk;
    try {
      disk = await vault.read(dailyPath(get().folder, key));
    } catch (e) {
      set({ status: { text: `Couldn't read the note: ${(e as Error).message}`, error: true } });
      return;
    }

    set({
      key,
      base: { text: disk.text, mtime: disk.mtime, exists: disk.exists },
      text: disk.text,
      dirty: false,
      alert: null,
      status: { text: disk.exists ? "Loaded from your vault" : "New note: it's saved once you start typing" },
    });
  },

  setText(text) {
    set({ text, dirty: true, status: { text: "Unsaved changes…" } });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void get().saveNow(), SAVE_DELAY);
  },

  async saveNow({ overwrite = false, createFolder = false } = {}) {
    clearTimeout(saveTimer);
    const { key, base, dirty, saving, folder } = get();
    if (!key || !base || !dirty || saving) return;

    const text = get().text;
    const path = dailyPath(folder, key);

    // don't create empty files just by visiting a day
    if (!base.exists && !text.trim()) {
      set({ dirty: false, status: { text: "" } });
      return;
    }

    set({ saving: true });
    try {
      // unless overwriting, the server refuses the save if the note was changed in Obsidian since we loaded it
      const mtime = await useVault.getState().write(path, text, {
        createFolder,
        base: overwrite ? undefined : { text: base.text, mtime: base.mtime },
      });

      if (get().key === key) {
        const stillSame = get().text === text;
        set({
          base: { text, mtime, exists: true },
          alert: null,
          dirty: !stillSame,
          status: stillSame ? { text: `Saved ${formatClockTime()}` } : get().status,
        });
        if (!stillSame) get().setText(get().text);
      }
    } catch (e) {
      if (e instanceof ConflictError) {
        set({
          alert: {
            message: "This note was changed in Obsidian after you opened it here.",
            actions: [
              { label: "USE OBSIDIAN'S VERSION", run: () => { set({ dirty: false }); void get().load(); } },
              { label: "KEEP MINE", run: () => { set({ alert: null }); void get().saveNow({ overwrite: true }); } },
            ],
          },
          status: { text: "Not saved: see the message above.", error: true },
        });
      } else if (e instanceof FolderMissingError) {
        set({
          alert: {
            message: `The folder “${cleanFolder(folder)}” isn't in your vault. If you moved it, change the folder name in the side panel.`,
            actions: [{ label: "CREATE IT", run: () => { set({ alert: null }); void get().saveNow({ overwrite: true, createFolder: true }); } }],
          },
          status: { text: "Not saved: folder not found.", error: true },
        });
      } else {
        set({ status: { text: `Save failed: ${(e as Error).message}`, error: true } });
      }
    } finally {
      set({ saving: false });
    }
  },

  async flush(path) {
    if (get().dirty && get().path() === path) await get().saveNow();
  },
}));

// When the open note changes on disk (edited in Obsidian, or by the task board)
// and there's no unsaved typing here, show the new version.
useVault.subscribe((state, prev) => {
  if (state.notes === prev.notes) return;
  const t = useToday.getState();
  const path = t.path();
  if (!path || !t.base || t.dirty || t.saving) return;
  const note = state.notes.find((n) => n.path === path);
  if (note && note.text !== t.base.text && note.mtime > t.base.mtime) {
    useToday.setState({
      base: { text: note.text, mtime: note.mtime, exists: true },
      text: note.text,
      status: { text: "Updated with the latest version from your vault" },
    });
  }
});

/** Test helper */
export function resetTodayForTests(): void {
  clearTimeout(saveTimer);
  useToday.setState({
    folder: DAILY_DEFAULT, offset: 0, key: null, base: null, text: "",
    dirty: false, saving: false, status: { text: "" }, alert: null,
  });
}
