// App-level UI state: active tab, the note open in the Obsidian tab, sidebar state.

import { create } from "zustand";
import { KEYS, readJSON, readString, writeJSON, writeString } from "../lib/storage";

export const TABS = [
  { id: "timerTab", label: "⏱ TIMER" },
  { id: "todayTab", label: "📅 TODAY" },
  { id: "boardTab", label: "✅ TASKS" },
  { id: "habitTab", label: "🔁 HABITS" },
  { id: "vaultTab", label: "📓 OBSIDIAN" },
  { id: "saverTab", label: "🌙 SCREENSAVER" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

// "large" is for reading a phone from across the desk, "compact" for a laptop at arm's length
export type TextSize = "large" | "compact";

function applyTextSize(size: TextSize) {
  document.documentElement.dataset.textSize = size;
}

const isTab = (v: string): v is TabId => TABS.some((t) => t.id === v);

function parentFolders(path: string): string[] {
  const parts = path.split("/").slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

interface UIState {
  tab: TabId;
  notePath: string | null;
  sideCollapsed: boolean;
  openFolders: string[];
  textSize: TextSize;

  setTab: (tab: TabId) => void;
  openNote: (path: string, switchTab?: boolean) => void;
  closeNote: () => void;
  toggleSide: () => void;
  setFolderOpen: (folder: string, open: boolean) => void;
  setAllFolders: (folders: string[]) => void;
  toggleTextSize: () => void;
}

const savedTab = readString(KEYS.activeTab, "timerTab");
const savedTextSize: TextSize = readString(KEYS.textSize, "large") === "compact" ? "compact" : "large";
applyTextSize(savedTextSize);

export const useUI = create<UIState>()((set, get) => ({
  tab: isTab(savedTab) ? savedTab : "timerTab",
  notePath: null,
  sideCollapsed: readString(KEYS.sideCollapsed, "1") !== "0",
  openFolders: readJSON<string[]>(KEYS.openFolders, []),
  textSize: savedTextSize,

  setTab(tab) {
    writeString(KEYS.activeTab, tab);
    set({ tab });
  },

  openNote(path, switchTab = false) {
    // expand the folders that contain the note so it shows up highlighted in the tree
    const openFolders = [...new Set([...get().openFolders, ...parentFolders(path)])];
    writeJSON(KEYS.openFolders, openFolders);
    set({ notePath: path, openFolders });
    if (switchTab) get().setTab("vaultTab");
  },

  closeNote: () => set({ notePath: null }),

  toggleSide() {
    const sideCollapsed = !get().sideCollapsed;
    writeString(KEYS.sideCollapsed, sideCollapsed ? "1" : "0");
    set({ sideCollapsed });
  },

  setFolderOpen(folder, open) {
    const current = new Set(get().openFolders);
    if (open) current.add(folder);
    else current.delete(folder);
    const openFolders = [...current];
    writeJSON(KEYS.openFolders, openFolders);
    set({ openFolders });
  },

  setAllFolders(folders) {
    writeJSON(KEYS.openFolders, folders);
    set({ openFolders: folders });
  },

  toggleTextSize() {
    const textSize: TextSize = get().textSize === "large" ? "compact" : "large";
    writeString(KEYS.textSize, textSize);
    applyTextSize(textSize);
    set({ textSize });
  },
}));
