import { useMemo, useState } from "react";
import { useUI } from "../../app/ui";
import { Button } from "../../components/ui";
import { cx } from "../../lib/cx";
import { formatDateTime } from "../../lib/dates";
import { useVault } from "../../vault/store";
import type { Note } from "../../vault/types";
import { parseTasks } from "../board/tasks";

type View = "files" | "recent" | "tasks";

interface TreeNode {
  dirs: Map<string, TreeNode>;
  files: Note[];
}

function buildTree(notes: Note[]): TreeNode {
  const root: TreeNode = { dirs: new Map(), files: [] };
  for (const n of notes) {
    let node = root;
    for (const part of n.folder ? n.folder.split("/") : []) {
      if (!node.dirs.has(part)) node.dirs.set(part, { dirs: new Map(), files: [] });
      node = node.dirs.get(part)!;
    }
    node.files.push(n);
  }
  return root;
}

function allFolders(notes: Note[]): string[] {
  const set = new Set<string>();
  for (const n of notes) {
    const parts = n.folder ? n.folder.split("/") : [];
    parts.forEach((_, i) => set.add(parts.slice(0, i + 1).join("/")));
  }
  return [...set];
}

function NoteLink({ note, sub }: { note: Note; sub?: string }) {
  const active = useUI((s) => s.notePath === note.path);
  const openNote = useUI((s) => s.openNote);
  return (
    <button
      type="button"
      title={note.path}
      onClick={() => openNote(note.path)}
      className={cx(
        "my-px block w-full truncate rounded-[7px] px-2 py-[5px] text-left text-list font-medium",
        active ? "bg-brand-deep text-white" : "bg-transparent text-soft",
      )}
    >
      {note.name || "(untitled)"}
      {sub && <small className="mt-0.5 block text-sm whitespace-normal text-faint">{sub}</small>}
    </button>
  );
}

function Folder({ name, path, node }: { name: string; path: string; node: TreeNode }) {
  const open = useUI((s) => s.openFolders.includes(path));
  const setFolderOpen = useUI((s) => s.setFolderOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setFolderOpen(path, !open)}
        aria-expanded={open}
        className="w-full bg-transparent px-0.5 py-1 text-left font-[650] text-muted select-none"
      >
        {open ? "▾ " : "▸ "}
        {name}
      </button>
      {open && (
        <div className="ml-[5px] border-l border-line pl-3">
          <TreeChildren node={node} prefix={path} />
        </div>
      )}
    </div>
  );
}

function TreeChildren({ node, prefix }: { node: TreeNode; prefix: string }) {
  return (
    <>
      {[...node.dirs.keys()].sort().map((name) => (
        <Folder key={name} name={name} path={prefix ? `${prefix}/${name}` : name} node={node.dirs.get(name)!} />
      ))}
      {node.files.map((n) => (
        <NoteLink key={n.path} note={n} />
      ))}
    </>
  );
}

export function Sidebar() {
  const notes = useVault((s) => s.notes);
  const vaultName = useVault((s) => s.name || "Vault");
  const refresh = useVault((s) => s.refresh);
  const { sideCollapsed, toggleSide, setAllFolders } = useUI();
  const [view, setView] = useState<View>("files");
  const [query, setQuery] = useState("");

  const tree = useMemo(() => buildTree(notes), [notes]);
  const q = query.trim().toLowerCase();

  let body: React.ReactNode;
  if (q) {
    const hits = notes.filter((n) => n.name.toLowerCase().includes(q) || n.text.toLowerCase().includes(q));
    body = hits.length ? (
      hits.map((n) => {
        const i = n.text.toLowerCase().indexOf(q);
        const snippet = i < 0 ? n.folder : `…${n.text.slice(Math.max(0, i - 30), i + 60).replace(/\s+/g, " ")}…`;
        return <NoteLink key={n.path} note={n} sub={snippet} />;
      })
    ) : (
      <p className="text-faint">No matches.</p>
    );
  } else if (view === "recent") {
    body = [...notes]
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 25)
      .map((n) => <NoteLink key={n.path} note={n} sub={`${formatDateTime(n.mtime)} · ${n.folder || "/"}`} />);
  } else if (view === "tasks") {
    const open = parseTasks(notes).filter((t) => t.status === " ");
    body = open.length ? (
      open.map((t) => {
        const note = notes.find((n) => n.path === t.path)!;
        return <NoteLink key={t.id} note={note} sub={`☐ ${t.text}`} />;
      })
    ) : (
      <p className="text-faint">No open tasks ( - [ ] ) in this vault.</p>
    );
  } else {
    body = (
      <>
        <div className="mb-2 flex gap-1.5">
          <Button variant="ghost" size="sm" className="flex-1" onClick={() => setAllFolders(allFolders(notes))}>
            ⊞ Expand all
          </Button>
          <Button variant="ghost" size="sm" className="flex-1" onClick={() => setAllFolders([])}>
            ⊟ Collapse all
          </Button>
        </div>
        <TreeChildren node={tree} prefix="" />
      </>
    );
  }

  return (
    <aside
      className={cx(
        "flex min-h-0 flex-col gap-2.5 border-r border-line portrait:border-r-0 portrait:border-b",
        sideCollapsed ? "items-center px-1.5 py-3.5 portrait:items-start portrait:px-3 portrait:py-2" : "p-4",
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <Button
          size="bare"
          className="shrink-0 rounded-lg px-2.5 py-1 text-xl leading-none"
          title={sideCollapsed ? "Show sidebar" : "Hide sidebar"}
          onClick={toggleSide}
        >
          {sideCollapsed ? "»" : "«"}
        </Button>
        {!sideCollapsed && (
          <>
            <div className="min-w-0 flex-1 truncate text-lg font-[750]">📓 {vaultName}</div>
            <div className="flex gap-1.5">
              <Button size="sm" title="Re-read notes from disk" onClick={() => void refresh()}>↻</Button>
            </div>
          </>
        )}
      </div>

      {!sideCollapsed && (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes…"
            className="w-full rounded-xl border border-line bg-panel px-3.5 py-3 text-[15px] text-ink"
          />
          <div className="flex gap-1.5">
            {(["files", "recent", "tasks"] as const).map((v) => (
              <Button
                key={v}
                size="sm"
                variant={view === v ? "default" : "ghost"}
                className={cx("flex-1", view === v && "border-line")}
                onClick={() => setView(v)}
              >
                {v.toUpperCase()}
              </Button>
            ))}
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto text-list">{body}</nav>
        </>
      )}
    </aside>
  );
}
