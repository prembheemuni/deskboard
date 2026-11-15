// Checkbox tasks inside notes.
//   - [ ]  → To do     - [/]  → Doing     - [x]  → Done (with a "✅ YYYY-MM-DD" stamp)

import type { Note } from "../../vault/types";

export type TaskStatus = " " | "/" | "x";

export const STATUS_ORDER: TaskStatus[] = [" ", "/", "x"];
export const STATUS_NAMES: Record<TaskStatus, string> = { " ": "To do", "/": "Doing", x: "Done" };

export interface Task {
  /** path::line — stable while the note's line count doesn't change above it */
  id: string;
  path: string;
  noteName: string;
  folder: string;
  noteMtime: number;
  /** 0-based line number in the note */
  line: number;
  /** The full original line, used to find it again before editing */
  raw: string;
  status: TaskStatus;
  indent: string;
  bullet: string;
  /** Everything after "[ ] " */
  body: string;
  /** Display text (dates and link brackets removed) */
  text: string;
  doneOn: string | null;
  due: string | null;
}

const TASK_RE = /^(\s*)([-*+]) \[(.)\] (.*)$/;
const FENCE_RE = /^\s*(```|~~~)/;
const DATE_TOKENS_RE = /(?:✅|📅|⏳|🛫)\s*\d{4}-\d{2}-\d{2}/gu;

function toStatus(c: string): TaskStatus | null {
  const lc = c.toLowerCase();
  if (lc === " ") return " ";
  if (lc === "/") return "/";
  if (lc === "x") return "x";
  return null; // cancelled [-] and other custom states are ignored
}

export function displayText(body: string): string {
  return (
    body
      .replace(DATE_TOKENS_RE, "")
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .trim() || "(empty task)"
  );
}

export function parseNoteTasks(note: Note): Task[] {
  const out: Task[] = [];
  let inCode = false;
  note.text.split("\n").forEach((raw, line) => {
    if (FENCE_RE.test(raw)) {
      inCode = !inCode;
      return;
    }
    if (inCode) return;
    const m = raw.match(TASK_RE);
    if (!m) return;
    const status = toStatus(m[3]);
    if (!status) return;
    const body = m[4];
    out.push({
      id: `${note.path}::${line}`,
      path: note.path,
      noteName: note.name,
      folder: note.folder,
      noteMtime: note.mtime,
      line,
      raw,
      status,
      indent: m[1],
      bullet: m[2],
      body,
      text: displayText(body),
      doneOn: body.match(/✅\s*(\d{4}-\d{2}-\d{2})/u)?.[1] ?? null,
      due: body.match(/📅\s*(\d{4}-\d{2}-\d{2})/u)?.[1] ?? null,
    });
  });
  return out;
}

/** All tasks in the given notes, skipping any "Templates" folder. */
export function parseTasks(notes: Note[]): Task[] {
  return notes
    .filter((n) => !n.path.split("/").some((p) => /^templates?$/i.test(p)))
    .flatMap(parseNoteTasks);
}

/** The line rewritten with a new status. Done adds today's ✅ stamp; leaving Done removes it. */
export function rebuildLine(task: Pick<Task, "indent" | "bullet" | "body">, status: TaskStatus, todayKey: string): string {
  let body = task.body.replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/gu, "");
  if (status === "x") body = `${body.replace(/\s+$/, "")} ✅ ${todayKey}`;
  return `${task.indent}${task.bullet} [${status}] ${body}`;
}

/** Text of unchecked tasks in a note (for "carry over"). */
export function openTaskTexts(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.match(/^\s*[-*+] \[ \] (.+)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1].trim());
}

/** Order for the To do / Doing columns: due date first, then most recently edited note. */
export function compareOpen(a: Task, b: Task): number {
  return (
    (a.due ?? "9999").localeCompare(b.due ?? "9999") ||
    b.noteMtime - a.noteMtime ||
    a.line - b.line
  );
}

/** Order for the Done column: most recently finished first. */
export function compareDone(a: Task, b: Task): number {
  return (b.doneOn ?? "").localeCompare(a.doneOn ?? "") || compareOpen(a, b);
}
