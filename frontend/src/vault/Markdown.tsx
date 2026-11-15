import { useMemo } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { WIKILINK_PREFIX, findNote, prepareMarkdown } from "./wikilinks";
import type { Note } from "./types";

const urlTransform = (url: string): string =>
  url.startsWith(WIKILINK_PREFIX) ? url : defaultUrlTransform(url);

/** Renders a note as React elements (no raw HTML is injected). */
export function Markdown({ text, notes, onOpen }: { text: string; notes: Note[]; onOpen: (path: string) => void }) {
  const source = useMemo(() => prepareMarkdown(text), [text]);

  const components = useMemo<Components>(
    () => ({
      a({ href = "", children }) {
        if (href.startsWith(WIKILINK_PREFIX)) {
          const target = findNote(notes, decodeURIComponent(href.slice(WIKILINK_PREFIX.length)));
          return (
            <a
              href="#"
              className={target ? "wikilink" : "wikilink missing"}
              title={target ? target.path : "Note not found"}
              onClick={(e) => {
                e.preventDefault();
                if (target) onOpen(target.path);
              }}
            >
              {children}
            </a>
          );
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      },
    }),
    [notes, onOpen],
  );

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} urlTransform={urlTransform} components={components}>
      {source}
    </ReactMarkdown>
  );
}
