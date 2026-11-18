// Habits: the checklist comes from a routine note in the vault, and each day's ticks are kept in a
// log note next to it. Both are plain Markdown, so they read fine in Obsidian too.
//
// Routine note: every top-level checkbox line is a habit; the heading above it groups it; indented
// lines under it are shown as its notes. Other lines (plain bullets, text) are left alone.
//
//   # 🌅 Every Morning
//   - [ ] **Read The Rundown AI** *(5 min)*
//     - Daily summary of the biggest AI news
//
// Log note: one line per day listing the habits ticked that day, newest first.
//
//   - 2026-11-17: Read The Rundown AI (5 min); Check X (2 min)

import { addDaysKey } from "../../lib/dates";

export interface Habit {
  /** Display name, Markdown removed; also how the log refers to it */
  name: string;
  /** Indented lines under the checkbox */
  details: string[];
}

export interface HabitGroup {
  title: string;
  habits: Habit[];
}

/** Day key → names of the habits ticked that day */
export type HabitLog = Map<string, Set<string>>;

export const ROUTINE_DEFAULT = "Daily Routine.md";
export const LOG_NAME = "Habit Log.md";

const HEADING_RE = /^#{1,6}\s+(.*?)\s*#*\s*$/;
const HABIT_RE = /^ ?[-*+] \[.\] (.*)$/; // top level (allow one stray space)
const DETAIL_RE = /^\s+(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?(.*)$/;
const FENCE_RE = /^\s*(```|~~~)/;
const LOG_LINE_RE = /^\s*[-*+]\s+(\d{4}-\d{2}-\d{2}):[ \t]*(.*)$/;

/** Plain text for a Markdown snippet: no bold/italic/code markers, wikilinks shown by their label. */
export function plainText(md: string): string {
  return md
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[\s(])[*_](\S(?:.*?\S)?)[*_](?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/;/g, ",") // ";" separates habits in the log
    .replace(/\s+/g, " ")
    .trim();
}

export function parseRoutine(text: string): HabitGroup[] {
  const groups: HabitGroup[] = [];
  let group: HabitGroup = { title: "", habits: [] };
  let current: Habit | null = null;
  let inCode = false;
  let inFrontmatter = false;
  const seen = new Map<string, number>();

  text.split(/\r?\n/).forEach((line, i) => {
    if (i === 0 && line.trim() === "---") {
      inFrontmatter = true;
      return;
    }
    if (inFrontmatter) {
      if (line.trim() === "---") inFrontmatter = false;
      return;
    }
    if (FENCE_RE.test(line)) {
      inCode = !inCode;
      return;
    }
    if (inCode) return;

    const heading = line.match(HEADING_RE);
    if (heading) {
      if (group.habits.length) groups.push(group);
      group = { title: plainText(heading[1]), habits: [] };
      current = null;
      return;
    }
    const habit = line.match(HABIT_RE);
    if (habit) {
      let name = plainText(habit[1]) || "(unnamed)";
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      if (n > 1) name = `${name} (${n})`; // keep names unique: the log refers to habits by name
      current = { name, details: [] };
      group.habits.push(current);
      return;
    }
    const detail = line.match(DETAIL_RE);
    if (detail && current) {
      const d = plainText(detail[1]);
      if (d) current.details.push(d);
      return;
    }
    // anything else at the top level (text, plain bullets, rules) ends the current habit's notes
    if (line.trim() && !/^\s/.test(line)) current = null;
  });
  if (group.habits.length) groups.push(group);
  return groups;
}

export function parseLog(text: string): HabitLog {
  const log: HabitLog = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(LOG_LINE_RE);
    if (!m) continue;
    const names = m[2]
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    const set = log.get(m[1]) ?? new Set<string>();
    names.forEach((n) => set.add(n));
    log.set(m[1], set);
  }
  return log;
}

export const LOG_HEADER =
  "# Habit Log\n\nTicked off in Deskboard's Habits tab: one line per day with the habits done that day. You can edit it here too.\n";

/**
 * Mark one habit done or not done for a day, returning the new log text. Only that day's line changes
 * (it's added in date order, newest first, or removed when nothing is left ticked that day).
 */
export function setHabitDone(text: string, day: string, name: string, done: boolean): string {
  const lines = text.trim() ? text.replace(/\r\n/g, "\n").split("\n") : LOG_HEADER.split("\n");
  const idx = lines.findIndex((l) => l.match(LOG_LINE_RE)?.[1] === day);
  const names = idx >= 0 ? [...(parseLog(lines[idx]).get(day) ?? [])] : [];
  const has = names.includes(name);
  if (done === has) return text;
  const next = done ? [...names, name] : names.filter((n) => n !== name);
  const line = `- ${day}: ${next.join("; ")}`;

  if (idx >= 0) {
    if (next.length) lines[idx] = line;
    else lines.splice(idx, 1);
  } else {
    // newest first: before the first older day, else after the last log line, else at the end
    const older = lines.findIndex((l) => {
      const d = l.match(LOG_LINE_RE)?.[1];
      return d !== undefined && d < day;
    });
    if (older >= 0) lines.splice(older, 0, line);
    else {
      let last = -1;
      lines.forEach((l, i) => {
        if (LOG_LINE_RE.test(l)) last = i;
      });
      if (last >= 0) lines.splice(last + 1, 0, line);
      else {
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
        lines.push("", line);
      }
    }
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

/** Days in a row the habit was done, ending today, or yesterday if today isn't ticked yet. */
export function streak(log: HabitLog, name: string, today: string): number {
  let day = log.get(today)?.has(name) ? today : addDaysKey(today, -1);
  let n = 0;
  while (log.get(day)?.has(name)) {
    n++;
    day = addDaysKey(day, -1);
  }
  return n;
}

/** The last `count` day keys, oldest first, ending with today. */
export function lastDays(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDaysKey(today, i - count + 1));
}

/** "folder/Daily Routine.md" → "folder/Habit Log.md" */
export function logPathFor(routinePath: string): string {
  const i = routinePath.lastIndexOf("/");
  return i >= 0 ? `${routinePath.slice(0, i)}/${LOG_NAME}` : LOG_NAME;
}

export const ROUTINE_TEMPLATE = `# Daily Routine

Each \`- [ ]\` line below is a habit you tick off in Deskboard every day. Headings group them;
indented lines under a habit show as its notes.

## 🌅 Morning
- [ ] Drink a glass of water
- [ ] Plan the day
  - Pick the 3 things that matter today

## 🌙 Evening
- [ ] Review the day
`;
