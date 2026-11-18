// Habits tab: which routine note to read, ticking habits (written to the log note), editing the routine.

import { create } from "zustand";
import { ConflictError } from "../../api/client";
import type { AlertMessage, StatusMessage } from "../../components/types";
import { formatClockTime } from "../../lib/dates";
import { KEYS, readString, writeString } from "../../lib/storage";
import { useVault } from "../../vault/store";
import type { Note } from "../../vault/types";
import { logPathFor, ROUTINE_DEFAULT, setHabitDone } from "./routine";

const cleanPath = (p: string) => {
  const s = p.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  return s && !s.toLowerCase().endsWith(".md") ? `${s}.md` : s;
};

/** The routine note: the path set in the tab, else a note called "Daily Routine" anywhere in the vault. */
export function resolveRoutinePath(setting: string, notes: Note[]): string {
  if (setting) return setting;
  const found = notes.find((n) => n.name.toLowerCase() === "daily routine");
  return found?.path ?? ROUTINE_DEFAULT;
}

interface HabitsState {
  /** Path chosen in the tab ("" = find it automatically) */
  routineSetting: string;
  /** Ticks being saved: "day|name" → the new value, shown straight away */
  pending: Record<string, boolean>;
  status: StatusMessage;
  alert: AlertMessage | null;
  /** Text of the last successful routine save (the editor closes when it matches its draft) */
  savedRoutine: string | null;

  setRoutinePath: (path: string) => void;
  toggle: (routinePath: string, day: string, name: string, done: boolean) => Promise<void>;
  /** Save the routine note. `base` is the version the edit started from (null = new file). */
  saveRoutine: (path: string, text: string, base: { text: string; mtime: number } | null, overwrite?: boolean) => Promise<boolean>;
  setAlert: (alert: AlertMessage | null) => void;
}

// ticks are written one after another, each on top of the last, so fast clicking can't lose one
let queue: Promise<void> = Promise.resolve();

async function writeTick(logPath: string, day: string, name: string, done: boolean): Promise<void> {
  const vault = useVault.getState();
  const note = vault.notes.find((n) => n.path === logPath);
  let text = note?.text ?? "";
  let base = note ? { text: note.text, mtime: note.mtime } : undefined;
  try {
    await vault.write(logPath, setHabitDone(text, day, name, done), { base });
  } catch (e) {
    if (!(e instanceof ConflictError)) throw e;
    // the log was edited elsewhere (e.g. in Obsidian): apply this tick to the latest version instead
    const disk = await vault.read(logPath);
    text = disk.exists ? disk.text : "";
    base = disk.exists ? { text: disk.text, mtime: disk.mtime } : undefined;
    await vault.write(logPath, setHabitDone(text, day, name, done), { base });
  }
}

export const useHabits = create<HabitsState>()((set, get) => ({
  routineSetting: readString(KEYS.routinePath, ""),
  pending: {},
  status: { text: "" },
  alert: null,
  savedRoutine: null,

  setRoutinePath(path) {
    const p = cleanPath(path);
    writeString(KEYS.routinePath, p);
    set({ routineSetting: p, alert: null, status: { text: "" } });
  },

  toggle(routinePath, day, name, done) {
    const key = `${day}|${name}`;
    set((s) => ({ pending: { ...s.pending, [key]: done } }));
    queue = queue.then(async () => {
      try {
        await writeTick(logPathFor(routinePath), day, name, done);
        set({ status: { text: `Saved ${formatClockTime()}` } });
      } catch (e) {
        set({ status: { text: `Couldn't save the tick: ${(e as Error).message}`, error: true } });
      } finally {
        set((s) => {
          const pending = { ...s.pending };
          if (pending[key] === done) delete pending[key];
          return { pending };
        });
      }
    });
    return queue;
  },

  async saveRoutine(path, text, base, overwrite = false) {
    try {
      await useVault.getState().write(path, text, { base: overwrite || !base ? undefined : base });
      set({ alert: null, savedRoutine: text, status: { text: `Routine saved ${formatClockTime()}` } });
      return true;
    } catch (e) {
      if (e instanceof ConflictError) {
        set({
          alert: {
            message: "The routine note was changed in Obsidian while you were editing it here.",
            actions: [
              { label: "KEEP MINE", run: () => void get().saveRoutine(path, text, base, true) },
              { label: "CANCEL", run: () => set({ alert: null }) },
            ],
          },
          status: { text: "Not saved: see the message above.", error: true },
        });
      } else {
        set({ status: { text: `Save failed: ${(e as Error).message}`, error: true } });
      }
      return false;
    }
  },

  setAlert: (alert) => set({ alert }),
}));

/** Test helper */
export function resetHabitsForTests(): void {
  queue = Promise.resolve();
  useHabits.setState({ routineSetting: "", pending: {}, status: { text: "" }, alert: null, savedRoutine: null });
}
