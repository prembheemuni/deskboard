// Turn Obsidian-flavoured markdown into standard markdown that react-markdown understands.

import type { Note } from "./types";

export const WIKILINK_PREFIX = "wikilink:";

/** Remove YAML frontmatter at the top of a note. */
export const stripFrontmatter = (text: string): string => text.replace(/^---\n[\s\S]*?\n---\n?/, "");

/**
 * [[note]], [[note|label]], [[note#heading]] and ![[embed]] become links with a
 * "wikilink:" URL, which the renderer turns into in-app links.
 * #tags become inline code. Fenced code blocks are left untouched.
 */
export function prepareMarkdown(text: string): string {
  const parts = stripFrontmatter(text).split(/(^```[\s\S]*?^```|^~~~[\s\S]*?^~~~)/m);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // code block
      return part
        .replace(/!?\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, target: string, heading?: string, label?: string) => {
          const shown = (label ?? `${target}${heading ?? ""}`).replace(/([[\]])/g, "\\$1");
          return `[${shown}](${WIKILINK_PREFIX}${encodeURIComponent(target.trim())})`;
        })
        .replace(/(^|\s)#([A-Za-z][\w\-/]*)/g, "$1`#$2`");
    })
    .join("");
}

/** Find the note a wikilink points to: by full path, by name, or by path ending. */
export function findNote(notes: Note[], target: string): Note | undefined {
  const t = target.trim().toLowerCase().replace(/\.md$/, "");
  const noExt = (p: string) => p.toLowerCase().replace(/\.md$/, "");
  return (
    notes.find((n) => noExt(n.path) === t) ??
    notes.find((n) => n.name.toLowerCase() === t) ??
    notes.find((n) => noExt(n.path).endsWith(`/${t}`))
  );
}

export const obsidianUrl = (vaultName: string, path: string): string =>
  `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(path.replace(/\.md$/, ""))}`;
