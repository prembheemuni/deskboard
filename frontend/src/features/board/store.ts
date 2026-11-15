// Task board actions. Edits run one after another (a queue) so quick clicks are never lost.

import { create } from "zustand";
import type { AlertMessage, StatusMessage } from "../../components/types";
import { dayKey } from "../../lib/dates";
import { insertUnderHeading } from "../../lib/text";
import { ConflictError, FolderMissingError } from "../../api/client";
import { useVault } from "../../vault/store";
import { cleanFolder, dailyPath, useToday } from "../today/store";
import { STATUS_NAMES, parseTasks, rebuildLine, type TaskStatus } from "./tasks";

interface BoardState {
  status: StatusMessage;
  alert: AlertMessage | null;
  search: string;
  showAllDone: boolean;
  setSearch: (s: string) => void;
  setShowAllDone: (v: boolean) => void;
  moveTask: (id: string, status: TaskStatus) => Promise<void>;
  addTask: (text: string) => Promise<boolean>;
}

let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn);
  queue = run.catch(() => undefined);
  return run;
}

const setStatus = (text: string, error = false) => useBoard.setState({ status: { text, error } });

async function doMove(id: string, status: TaskStatus): Promise<void> {
  // always work from the latest notes (an earlier queued edit may have changed them)
  const task = parseTasks(useVault.getState().notes).find((t) => t.id === id);
  if (!task || task.status === status) return;

  setStatus("Saving…");
  try {
    await useToday.getState().flush(task.path);

    const vault = useVault.getState();
    const disk = await vault.read(task.path);
    const lines = disk.text.split("\n");

    // make sure we edit the same line we showed (the note may have changed in Obsidian)
    let idx = task.line;
    if (lines[idx] !== task.raw) idx = lines.indexOf(task.raw);
    if (idx < 0) {
      setStatus("That task was changed in Obsidian. Board refreshed, try again.", true);
      await vault.refresh();
      return;
    }

    lines[idx] = rebuildLine(task, status, dayKey());
    await vault.write(task.path, lines.join("\n"), { crlf: disk.crlf, base: disk });
    setStatus(`Moved to ${STATUS_NAMES[status]} · ${task.noteName}`);
  } catch (e) {
    if (e instanceof ConflictError) {
      setStatus("That note changed in Obsidian while saving. Board refreshed, try again.", true);
      await useVault.getState().refresh();
      return;
    }
    setStatus(`Couldn't update the note: ${(e as Error).message}`, true);
  }
}

async function doAdd(text: string): Promise<boolean> {
  const key = dayKey();
  const line = `- [ ] ${text}`;
  const today = useToday.getState();
  setStatus("Saving…");

  try {
    if (today.key === key) {
      // today's note is open in the Today tab: add it there so nothing gets out of step
      today.setText(insertUnderHeading(today.text, "## Todo", line));
      await useToday.getState().saveNow();
    } else {
      const vault = useVault.getState();
      const path = dailyPath(today.folder, key);
      const disk = await vault.read(path);
      await vault.write(path, insertUnderHeading(disk.text, "## Todo", line), { crlf: disk.crlf, base: disk });
    }
    setStatus("Added to today's note");
    return true;
  } catch (e) {
    setStatus(
      e instanceof FolderMissingError
        ? `The daily notes folder “${cleanFolder(today.folder)}” isn't in your vault (set it in the Today tab).`
        : `Couldn't add the task: ${(e as Error).message}`,
      true,
    );
    return false;
  }
}

export const useBoard = create<BoardState>()((set) => ({
  status: { text: "" },
  alert: null,
  search: "",
  showAllDone: false,
  setSearch: (search) => set({ search }),
  setShowAllDone: (showAllDone) => set({ showAllDone }),
  moveTask: (id, status) => enqueue(() => doMove(id, status)),
  addTask: (text) => enqueue(() => doAdd(text)),
}));
