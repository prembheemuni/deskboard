// Small, pure text-editing helpers used by the Today editor and the task board.

/**
 * Insert a line under a heading (after any list items directly below it).
 * If the heading doesn't exist it is added at the end.
 */
export function insertUnderHeading(text: string, heading: string, line: string): string {
  const lines = text.split("\n");
  const h = lines.findIndex((l) => l.trim().toLowerCase() === heading.toLowerCase());
  if (h < 0) {
    const base = text.replace(/\s*$/, "");
    return `${base ? `${base}\n\n` : ""}${heading}\n${line}\n`;
  }
  let i = h + 1;
  while (i < lines.length && /^\s*([-*+]|\d+\.)\s/.test(lines[i])) i++;
  lines.splice(i, 0, line);
  return lines.join("\n");
}

/** Add tasks right below a "## Carried over" heading (created at the end if missing). */
export function addCarriedTasks(text: string, tasks: string[]): string {
  const heading = "## Carried over\n";
  const lines = tasks.map((t) => `- [ ] ${t}`).join("\n") + "\n";
  const at = text.indexOf(heading);
  if (at >= 0) {
    const insertAt = at + heading.length;
    return text.slice(0, insertAt) + lines + text.slice(insertAt);
  }
  return `${text.trim() ? `${text.replace(/\s*$/, "")}\n\n` : ""}${heading}${lines}`;
}

export type ListEnter =
  | { kind: "none" }
  | { kind: "end-list"; from: number; to: number }
  | { kind: "continue"; insert: string };

/**
 * What pressing Enter at `pos` should do inside a list:
 * continue it (- , - [ ] , 1. ) or end it when the current item is empty.
 */
export function listEnter(value: string, pos: number): ListEnter {
  const lineStart = value.lastIndexOf("\n", pos - 1) + 1;
  const line = value.slice(lineStart, pos);
  const m = line.match(/^(\s*)([-*+] \[[ xX/]\] |[-*+] |(\d+)\. )/);
  if (!m) return { kind: "none" };

  if (line.trim() === m[2].trim()) return { kind: "end-list", from: lineStart, to: pos };

  let marker = m[2];
  if (m[3]) marker = `${Number(m[3]) + 1}. `;
  else if (/\[[xX/]\]/.test(marker)) marker = marker.replace(/\[[xX/]\]/, "[ ]");
  return { kind: "continue", insert: `\n${m[1]}${marker}` };
}

/**
 * Text to insert for a snippet at the cursor, adding the line breaks needed
 * so headings start a new block and other snippets start a new line.
 */
export function snippetInsertion(before: string, snippet: string, inline = false): string {
  if (snippet.startsWith("## ")) {
    if (before && !before.endsWith("\n\n")) return (before.endsWith("\n") ? "\n" : "\n\n") + snippet;
    return snippet;
  }
  if (!inline && before && !before.endsWith("\n")) return `\n${snippet}`;
  return snippet;
}

/** First meaningful line of a note, without heading/list markers (for previews). */
export function previewLine(text: string, max = 70): string {
  const line = text
    .split("\n")
    .map((s) => s.trim().replace(/^(#+|[-*+] \[[ xX/]\]|[-*+]|\d+\.)\s*/, ""))
    .find(Boolean);
  return line ? line.slice(0, max) : "";
}
