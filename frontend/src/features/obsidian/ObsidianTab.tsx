import { useEffect, useRef } from "react";
import { useUI } from "../../app/ui";
import { VaultGate } from "../../components/VaultGate";
import { cx } from "../../lib/cx";
import { formatDateTime } from "../../lib/dates";
import { Markdown } from "../../vault/Markdown";
import { obsidianUrl } from "../../vault/wikilinks";
import { useVault } from "../../vault/store";
import { parseTasks } from "../board/tasks";
import { Sidebar } from "./Sidebar";

function NoteView() {
  const notes = useVault((s) => s.notes);
  const vaultName = useVault((s) => s.handle?.name ?? "");
  const notePath = useUI((s) => s.notePath);
  const openNote = useUI((s) => s.openNote);
  const scroller = useRef<HTMLElement>(null);
  const note = notePath ? notes.find((n) => n.path === notePath) : undefined;

  // jump to the top when a different note is opened (but not when the same note is refreshed)
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [notePath]);

  if (!note) {
    const openTasks = parseTasks(notes).filter((t) => t.status === " ").length;
    return (
      <article className="flex min-h-0 flex-col items-center justify-center gap-3.5 p-5 text-center text-muted">
        <h2 className="m-0 text-2xl font-bold text-ink">
          {notes.length} notes in {vaultName}
        </h2>
        <p className="m-0 max-w-[460px]">{openTasks} open tasks. Pick a note on the left, or search across all notes.</p>
      </article>
    );
  }

  return (
    <article ref={scroller} className="min-h-0 overflow-y-auto p-[clamp(16px,3vw,40px)]">
      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div>
          <h1 className="m-0 text-note-title leading-tight font-bold tracking-[-0.02em]">{note.name || "(untitled)"}</h1>
          <div className="mt-1.5 text-[clamp(14px,1vw,17px)] text-faint">
            {note.folder || "/"} · edited {formatDateTime(note.mtime)}
          </div>
        </div>
        <a
          href={obsidianUrl(vaultName, note.path)}
          className="inline-block rounded-xl bg-violet-deep px-3.5 py-2 text-[15px] font-bold whitespace-nowrap text-white no-underline"
        >
          OPEN IN OBSIDIAN ↗
        </a>
      </div>
      <div className="md text-note">
        {note.text.trim() ? (
          <Markdown text={note.text} notes={notes} onOpen={(p) => openNote(p)} />
        ) : (
          <p>
            <i>This note is empty.</i>
          </p>
        )}
      </div>
    </article>
  );
}

export function ObsidianTab() {
  const sideCollapsed = useUI((s) => s.sideCollapsed);
  return (
    <VaultGate
      title="Connect your Obsidian vault"
      description="Pick your vault folder (for example G:\My Drive\obsidian). Nothing is uploaded: notes are read straight from your disk."
    >
      <div
        className={cx(
          "grid h-full",
          sideCollapsed
            ? "grid-cols-[56px_minmax(0,1fr)] portrait:grid-cols-1 portrait:grid-rows-[auto_minmax(0,1fr)]"
            : "grid-cols-[minmax(260px,360px)_minmax(0,1fr)] portrait:grid-cols-1 portrait:grid-rows-[minmax(0,40%)_minmax(0,1fr)]",
        )}
      >
        <Sidebar />
        <NoteView />
      </div>
    </VaultGate>
  );
}
