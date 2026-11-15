import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../app/ui";
import { AlertBar, Button, StatusText } from "../../components/ui";
import { VaultGate } from "../../components/VaultGate";
import {
  dayKey,
  formatClockTime,
  formatDayWithWeekday,
  formatLongDate,
  isDayKey,
  offsetOf,
  relativeLabel,
} from "../../lib/dates";
import { addCarriedTasks, listEnter, previewLine, snippetInsertion } from "../../lib/text";
import { useVault } from "../../vault/store";
import type { Note } from "../../vault/types";
import { obsidianUrl } from "../../vault/wikilinks";
import { openTaskTexts } from "../board/tasks";
import { cleanFolder, dailyPath, useToday } from "./store";

const SNIPPETS: { id: string; label: string; text: () => string; inline?: boolean }[] = [
  { id: "changes", label: "+ CHANGES", text: () => "## Changes\n- " },
  { id: "todo", label: "+ TODO", text: () => "## Todo\n- [ ] " },
  { id: "task", label: "+ TASK", text: () => "- [ ] " },
  { id: "note", label: "+ NOTE", text: () => "Note:\n" },
  { id: "time", label: "+ TIME", text: () => `**${formatClockTime()}** `, inline: true },
];

function useDailyNotes(): Note[] {
  const notes = useVault((s) => s.notes);
  const folder = useToday((s) => s.folder);
  return useMemo(() => {
    const f = cleanFolder(folder);
    return notes.filter((n) => n.folder === f && isDayKey(n.name)).sort((a, b) => b.name.localeCompare(a.name));
  }, [notes, folder]);
}

function Editor() {
  const text = useToday((s) => s.text);
  const setText = useToday((s) => s.setText);
  const saveNow = useToday((s) => s.saveNow);
  const tab = useUI((s) => s.tab);
  const ref = useRef<HTMLTextAreaElement>(null);
  const typing = useRef(false);
  const selection = useRef<[number, number]>([0, 0]);

  // Keep the cursor in place when the text is replaced from outside (Obsidian edit, task board)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typing.current) {
      typing.current = false;
      return;
    }
    if (document.activeElement === el) {
      const [s, e] = selection.current;
      el.setSelectionRange(Math.min(s, text.length), Math.min(e, text.length));
    }
  }, [text]);

  useEffect(() => {
    if (tab === "todayTab") ref.current?.focus();
  }, [tab]);

  const commit = (el: HTMLTextAreaElement) => {
    typing.current = true;
    selection.current = [el.selectionStart, el.selectionEnd];
    setText(el.value);
  };

  const insertSnippet = (s: (typeof SNIPPETS)[number]) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const start = el.selectionStart;
    el.setRangeText(snippetInsertion(el.value.slice(0, start), s.text(), s.inline), start, el.selectionEnd, "end");
    commit(el);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void saveNow();
      return;
    }
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || el.selectionStart !== el.selectionEnd) return;
    const action = listEnter(el.value, el.selectionStart);
    if (action.kind === "none") return;
    e.preventDefault();
    if (action.kind === "end-list") el.setRangeText("", action.from, action.to, "end");
    else el.setRangeText(action.insert, el.selectionStart, el.selectionStart, "end");
    commit(el);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {SNIPPETS.map((s) => (
          <Button key={s.id} variant="raised" size="bare" className="rounded-lg px-3 py-[7px] text-sm" onClick={() => insertSnippet(s)}>
            {s.label}
          </Button>
        ))}
        <TodayStatus />
      </div>
      <TodayAlert />
      <textarea
        ref={ref}
        value={text}
        spellCheck
        placeholder="What are you working on today?"
        onChange={(e) => commit(e.currentTarget)}
        onSelect={(e) => {
          selection.current = [e.currentTarget.selectionStart, e.currentTarget.selectionEnd];
        }}
        onKeyDown={onKeyDown}
        className="min-h-[220px] w-full flex-1 resize-none rounded-xl border border-line bg-panel px-5 py-[18px] text-editor leading-[1.55] text-ink"
      />
    </>
  );
}

function TodayStatus() {
  const status = useToday((s) => s.status);
  return <StatusText status={status} className="ml-auto" />;
}

function TodayAlert() {
  const alert = useToday((s) => s.alert);
  return <AlertBar alert={alert} />;
}

const navBtn = "rounded-xl px-3.5 py-2 text-base";

function Header() {
  const key = useToday((s) => s.key);
  const folder = useToday((s) => s.folder);
  const offset = useToday((s) => s.offset);
  const go = useToday((s) => s.go);
  const vaultName = useVault((s) => s.handle?.name ?? "");
  if (!key) return null;
  const path = dailyPath(folder, key);

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-today-date leading-[1.05] font-[850] tracking-[-0.03em]">
          <small className="mb-1.5 block text-[0.38em] font-[750] tracking-[0.14em] text-progress">
            {relativeLabel(offsetOf(key))}
          </small>
          {formatLongDate(key)}
        </div>
        <div className="mt-1.5 text-sm text-faint">
          {vaultName} / {path}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="bare" className={navBtn} title="Previous day" onClick={() => void go(offset - 1)}>‹</Button>
        <Button size="bare" className={navBtn} onClick={() => void go(0)}>TODAY</Button>
        <Button size="bare" className={navBtn} title="Next day" onClick={() => void go(offset + 1)}>›</Button>
        <a
          href={obsidianUrl(vaultName, path)}
          className="inline-block rounded-xl bg-violet-deep px-3.5 py-2 text-[15px] font-bold whitespace-nowrap text-white no-underline"
        >
          OPEN IN OBSIDIAN ↗
        </a>
      </div>
    </div>
  );
}

function CarryOver({ dailyNotes }: { dailyNotes: Note[] }) {
  const key = useToday((s) => s.key);
  const text = useToday((s) => s.text);
  const setText = useToday((s) => s.setText);
  if (!key) return null;

  const prev = dailyNotes.find((n) => n.name < key);
  const tasks = prev ? openTaskTexts(prev.text).filter((t) => !text.includes(t)) : [];
  const add = (list: string[]) => setText(addCarriedTasks(useToday.getState().text, list));

  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="m-0 mt-2 text-lg font-bold">Carry over</h3>
      <div className="text-[13px] text-faint">
        {prev
          ? `Unchecked - [ ] tasks from ${formatDayWithWeekday(prev.name)}`
          : "No earlier daily note found."}
      </div>
      {prev && !tasks.length && <div className="text-[13px] text-faint">Nothing left to carry over.</div>}
      {tasks.map((t) => (
        <button
          key={t}
          type="button"
          title="Add to today"
          onClick={() => add([t])}
          className="w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-left text-[15px] font-medium"
        >
          + {t}
        </button>
      ))}
      {tasks.length > 1 && <Button onClick={() => add(tasks)}>ADD ALL TO TODAY</Button>}
    </section>
  );
}

function RecentDays({ dailyNotes }: { dailyNotes: Note[] }) {
  const key = useToday((s) => s.key);
  const go = useToday((s) => s.go);
  return (
    <section className="flex flex-col gap-1">
      <h3 className="m-0 mt-2 mb-1.5 text-lg font-bold">Recent days</h3>
      {!dailyNotes.length && <div className="text-[13px] text-faint">No daily notes yet.</div>}
      {dailyNotes.slice(0, 10).map((n) => {
        const preview = previewLine(n.text);
        return (
          <button
            key={n.path}
            type="button"
            onClick={() => void go(offsetOf(n.name))}
            className={`block w-full truncate rounded-[7px] px-2 py-[5px] text-left text-[17px] font-medium ${
              n.name === key ? "bg-brand-deep text-white" : "bg-transparent text-soft"
            }`}
          >
            {formatDayWithWeekday(n.name)}
            {preview && <small className="mt-0.5 block text-sm whitespace-normal text-faint">{preview}</small>}
          </button>
        );
      })}
    </section>
  );
}

function FolderSetting() {
  const folder = useToday((s) => s.folder);
  const setFolder = useToday((s) => s.setFolder);
  const [draft, setDraft] = useState(folder);
  useEffect(() => setDraft(folder), [folder]);
  const commit = () => {
    if (draft.trim() !== folder) void setFolder(draft);
  };
  return (
    <label className="mt-auto flex flex-col gap-1.5 pt-3.5 text-[13px] text-muted">
      Daily notes folder in your vault
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className="rounded-lg border border-line bg-panel px-2.5 py-2 text-sm text-ink"
      />
    </label>
  );
}

function TodayBody() {
  const vaultReady = useVault((s) => s.status === "ready");
  const key = useToday((s) => s.key);
  const load = useToday((s) => s.load);
  const dailyNotes = useDailyNotes();

  // load once the vault is ready
  useEffect(() => {
    if (vaultReady && !key) void load();
  }, [vaultReady, key, load]);

  // roll over to the new day at midnight
  useEffect(() => {
    const id = setInterval(() => {
      const t = useToday.getState();
      if (t.key && t.offset === 0 && t.key !== dayKey()) void t.load();
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // warn (and try to save) if the page is closed with unsaved text
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (useToday.getState().dirty) {
        void useToday.getState().saveNow();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_minmax(260px,360px)] portrait:grid-cols-1 portrait:grid-rows-[minmax(0,1fr)_auto]">
      <div className="flex min-h-0 flex-col gap-3 p-[clamp(14px,2.5vw,32px)]">
        <Header />
        <Editor />
      </div>
      <aside className="flex min-h-0 flex-col gap-2.5 overflow-y-auto border-l border-line p-4 portrait:max-h-[35dvh] portrait:border-t portrait:border-l-0">
        <CarryOver dailyNotes={dailyNotes} />
        <RecentDays dailyNotes={dailyNotes} />
        <FolderSetting />
      </aside>
    </div>
  );
}

export function TodayTab() {
  return (
    <VaultGate title="Today's daily note" description="Connect your Obsidian vault to write today's update straight into it.">
      <TodayBody />
    </VaultGate>
  );
}
