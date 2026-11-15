// App-level UI state: active tab, the note open in the Obsidian tab, sidebar state.

import { create } from "zustand";
import { KEYS, readJSON, readString, writeJSON, writeString } from "../lib/storage";

export const TABS = [
  { id: "timerTab", label: "⏱ TIMER" },
  { id: "todayTab", label: "📅 TODAY" },
  { id: "boardTab", label: "✅ TASKS" },
  { id: "vaultTab", label: "📓 OBSIDIAN" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

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

  setTab: (tab: TabId) => void;
  openNote: (path: string, switchTab?: boolean) => void;
  closeNote: () => void;
  toggleSide: () => void;
  setFolderOpen: (folder: string, open: boolean) => void;
  setAllFolders: (folders: string[]) => void;
}

const savedTab = readString(KEYS.activeTab, "timerTab");

export const useUI = create<UIState>()((set, get) => ({
  tab: isTab(savedTab) ? savedTab : "timerTab",
  notePath: null,
  sideCollapsed: readString(KEYS.sideCollapsed, "1") !== "0",
  openFolders: readJSON<string[]>(KEYS.openFolders, []),

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
}));
