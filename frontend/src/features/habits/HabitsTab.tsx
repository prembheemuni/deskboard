import { useEffect, useMemo, useRef, useState } from "react";
import { AlertBar, Button, StatusText } from "../../components/ui";
import { VaultGate } from "../../components/VaultGate";
import { cx } from "../../lib/cx";
import { dayKey, formatLongDate, keyToDate } from "../../lib/dates";
import { useVault } from "../../vault/store";
import { lastDays, logPathFor, parseLog, parseRoutine, ROUTINE_TEMPLATE, streak, type Habit, type HabitGroup } from "./routine";
import { resolveRoutinePath, useHabits } from "./store";

const DAYS = 30;

/** Today's key, updated when the date changes (the tab can stay open overnight). */
function useTodayKey(): string {
  const [key, setKey] = useState(dayKey);
  useEffect(() => {
    const id = setInterval(() => setKey(dayKey()), 30_000);
    return () => clearInterval(id);
  }, []);
  return key;
}

const shortDay = (key: string) => keyToDate(key).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const weekdayLetter = (key: string) => keyToDate(key).toLocaleDateString("en-IN", { weekday: "narrow" });
const isWeekend = (key: string) => [0, 6].includes(keyToDate(key).getDay());

// ---------- today's checklist ----------

function HabitRow({ habit, done, streakDays, onToggle }: { habit: Habit; done: boolean; streakDays: number; onToggle: () => void }) {
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        onClick={onToggle}
        className={cx(
          "flex w-full items-start gap-3.5 rounded-xl border px-3.5 py-3 text-left transition-colors",
          done ? "border-brand-line bg-brand-tint" : "border-line bg-panel hover:bg-raised",
        )}
      >
        <span
          aria-hidden
          className={cx(
            "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 text-base font-black",
            done ? "border-progress bg-progress text-deep" : "border-faint text-transparent",
          )}
        >
          ✓
        </span>
        <span className="min-w-0 flex-1">
          <span className={cx("block text-[17px] leading-snug font-semibold", done ? "text-mint" : "text-ink")}>{habit.name}</span>
          {habit.details.length > 0 && (
            <span className="mt-1 block text-[13px] leading-snug text-muted">{habit.details.join(" · ")}</span>
          )}
        </span>
        {streakDays >= 2 && (
          <span className="shrink-0 rounded-md bg-raised px-2 py-0.5 text-[13px] font-bold text-warn" title={`${streakDays} days in a row`}>
            🔥 {streakDays}
          </span>
        )}
      </button>
    </li>
  );
}

function Checklist({ groups, today, isDone, toggle, streakOf }: {
  groups: HabitGroup[];
  today: string;
  isDone: (day: string, name: string) => boolean;
  toggle: (day: string, name: string) => void;
  streakOf: (name: string) => number;
}) {
  return (
    <section aria-label="Today's checklist" className="flex min-w-0 flex-col gap-4">
      {groups.map((g) => (
        <div key={g.title || "_"}>
          {g.title && <h3 className="mb-2 text-[13px] font-bold tracking-[0.12em] text-muted uppercase">{g.title}</h3>}
          <ul className="flex flex-col gap-2">
            {g.habits.map((h) => (
              <HabitRow key={h.name} habit={h} done={isDone(today, h.name)} streakDays={streakOf(h.name)} onToggle={() => toggle(today, h.name)} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

// ---------- 30-day tracker ----------

function Tracker({ habits, days, today, isDone, toggle, streakOf }: {
  habits: Habit[];
  days: string[];
  today: string;
  isDone: (day: string, name: string) => boolean;
  toggle: (day: string, name: string) => void;
  streakOf: (name: string) => number;
}) {
  const perDay = days.map((d) => habits.filter((h) => isDone(d, h.name)).length);
  // on narrow screens the grid scrolls sideways: start at the most recent days
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [today]);
  return (
    <section aria-labelledby="tracker-title" className="min-w-0 rounded-2xl border border-line bg-deep p-[clamp(10px,1.5vw,18px)]">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 id="tracker-title" className="text-[13px] font-bold tracking-[0.12em] text-muted uppercase">
          Last {DAYS} days
        </h3>
        <span className="text-xs text-faint">Click a square to fix a day</span>
      </div>
      <div ref={scroller} className="overflow-x-auto">
        <table className="w-full min-w-[680px] table-fixed border-separate border-spacing-[2px] text-[11px]">
          <caption className="sr-only">Habits done each day over the last {DAYS} days</caption>
          <colgroup>
            <col className="w-[28%]" />
            {days.map((d) => (
              <col key={d} />
            ))}
            <col className="w-[44px]" />
            <col className="w-[40px]" />
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-deep" />
              {days.map((d) => (
                <th
                  key={d}
                  scope="col"
                  title={shortDay(d)}
                  className={cx("pb-1 font-semibold", d === today ? "text-ink" : isWeekend(d) ? "text-faint" : "text-muted")}
                >
                  <span className="block leading-tight">{weekdayLetter(d)}</span>
                  <span className="block leading-tight">{keyToDate(d).getDate()}</span>
                </th>
              ))}
              <th scope="col" className="pb-1 font-semibold text-muted" title={`Days done out of ${DAYS}`}>
                Done
              </th>
              <th scope="col" className="pb-1 font-semibold text-muted" title="Current streak">
                🔥
              </th>
            </tr>
          </thead>
          <tbody>
            {habits.map((h) => {
              const count = days.filter((d) => isDone(d, h.name)).length;
              return (
                <tr key={h.name}>
                  <th scope="row" title={h.name} className="sticky left-0 z-10 truncate bg-deep pr-2 text-left text-[12px] font-semibold text-soft">
                    {h.name}
                  </th>
                  {days.map((d) => {
                    const done = isDone(d, h.name);
                    return (
                      <td key={d} className="p-0">
                        <button
                          type="button"
                          onClick={() => toggle(d, h.name)}
                          title={`${shortDay(d)} · ${h.name}: ${done ? "done" : "not done"}`}
                          aria-label={`${h.name} on ${shortDay(d)}: ${done ? "done" : "not done"}`}
                          aria-pressed={done}
                          className={cx(
                            "block aspect-square w-full min-w-[12px] rounded-[4px] hover:ring-2 hover:ring-soft/60",
                            done ? "bg-progress" : "bg-raised",
                            d === today && "outline-2 outline-offset-1 outline-soft/70",
                          )}
                        />
                      </td>
                    );
                  })}
                  <td className="text-center font-semibold text-soft tabular-nums">
                    {count}/{DAYS}
                  </td>
                  <td className="text-center font-semibold text-warn tabular-nums">{streakOf(h.name) || "–"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="sticky left-0 z-10 bg-deep pt-1.5 text-left text-[12px] font-semibold text-muted">
                All habits
              </th>
              {days.map((d, i) => {
                const share = habits.length ? perDay[i] / habits.length : 0;
                return (
                  <td key={d} className="p-0 pt-1.5" title={`${shortDay(d)}: ${perDay[i]} of ${habits.length} done`}>
                    {/* one hue, stronger = more of the routine done that day */}
                    <div className="relative aspect-square w-full overflow-hidden rounded-[4px] bg-raised">
                      <div className="absolute inset-0 bg-progress" style={{ opacity: share === 0 ? 0 : 0.2 + 0.8 * share }} />
                    </div>
                  </td>
                );
              })}
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-[120px] rounded-xl border border-line bg-panel px-4 py-2.5" title={hint}>
      <div className="text-[11px] font-bold tracking-[0.12em] text-muted uppercase">{label}</div>
      <div className="text-[26px] leading-tight font-[800] text-ink tabular-nums">{value}</div>
    </div>
  );
}

// ---------- routine file: choose and edit ----------

function RoutinePicker({ path, auto }: { path: string; auto: boolean }) {
  const notes = useVault((s) => s.notes);
  const setRoutinePath = useHabits((s) => s.setRoutinePath);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(path);

  if (!open)
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setValue(path);
          setOpen(true);
        }}
        title={auto ? `${path}: found automatically. Click to choose another note.` : `${path}: click to choose another note`}
        className="max-w-[min(420px,60vw)] truncate"
      >
        📄 {path}
        {auto && <span className="font-normal text-faint"> · auto</span>}
      </Button>
    );

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setRoutinePath(value);
        setOpen(false);
      }}
    >
      <input
        autoFocus
        list="habit-routine-notes"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Routine note path"
        placeholder="folder/Daily Routine.md"
        className="w-[min(380px,70vw)] rounded-lg border border-line bg-panel px-3 py-1.5 text-sm text-ink"
      />
      <datalist id="habit-routine-notes">
        {notes.map((n) => (
          <option key={n.path} value={n.path} />
        ))}
      </datalist>
      <Button size="sm" variant="primary" type="submit">
        USE
      </Button>
      <Button
        size="sm"
        title="Find a note called “Daily Routine” automatically"
        onClick={() => {
          setRoutinePath("");
          setOpen(false);
        }}
      >
        AUTO
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        CANCEL
      </Button>
    </form>
  );
}

function RoutineEditor({ path, onClose }: { path: string; onClose: () => void }) {
  const note = useVault((s) => s.notes.find((n) => n.path === path));
  const saveRoutine = useHabits((s) => s.saveRoutine);
  const savedRoutine = useHabits((s) => s.savedRoutine);
  const [base] = useState(() => (note ? { text: note.text, mtime: note.mtime } : null));
  const [draft, setDraft] = useState(() => note?.text ?? ROUTINE_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  // closes after a save, including one made from the "KEEP MINE" button on a conflict
  useEffect(() => {
    if (savedRoutine !== null && savedRoutine === draft) onClose();
  }, [savedRoutine, draft, onClose]);

  const save = async () => {
    setSaving(true);
    await saveRoutine(path, draft, base);
    setSaving(false);
  };

  return (
    <section aria-label="Edit routine" className="flex min-h-0 flex-1 flex-col gap-2.5">
      <p className="text-sm text-muted">
        Editing <code className="text-soft">{path}</code>
        {!note && " (new note)"}. Each <code className="text-soft">- [ ]</code> line is a habit; headings group them; indented
        lines under a habit show as its notes. Plain bullets and text are kept but not shown as habits.
      </p>
      <textarea
        ref={ref}
        autoFocus
        value={draft}
        spellCheck
        aria-label="Routine note"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            void save();
          }
          if (e.key === "Escape") onClose();
        }}
        className="min-h-[320px] flex-1 resize-none rounded-xl border border-line bg-panel p-4 font-mono text-[14px] leading-relaxed text-ink"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => void save()} disabled={saving}>
          {saving ? "SAVING…" : "SAVE"}
        </Button>
        <Button onClick={onClose}>CANCEL</Button>
        <span className="text-xs text-faint">Ctrl+S to save · Esc to cancel</span>
      </div>
    </section>
  );
}

// ---------- the tab ----------

function HabitsBody() {
  const notes = useVault((s) => s.notes);
  const { routineSetting, pending, status, alert, toggle: toggleTick, setAlert } = useHabits();
  const today = useTodayKey();
  const [editing, setEditing] = useState(false);

  const routinePath = resolveRoutinePath(routineSetting, notes);
  const routineNote = notes.find((n) => n.path === routinePath);
  const logNote = notes.find((n) => n.path === logPathFor(routinePath));

  const groups = useMemo(() => parseRoutine(routineNote?.text ?? ""), [routineNote?.text]);
  const habits = useMemo(() => groups.flatMap((g) => g.habits), [groups]);
  const log = useMemo(() => parseLog(logNote?.text ?? ""), [logNote?.text]);
  const days = useMemo(() => lastDays(today, DAYS), [today]);

  const isDone = (day: string, name: string) => pending[`${day}|${name}`] ?? log.get(day)?.has(name) ?? false;
  const toggle = (day: string, name: string) => void toggleTick(routinePath, day, name, !isDone(day, name));
  const streakOf = (name: string) => {
    // the log plus any ticks still being saved
    const merged = new Map(log);
    for (const [k, v] of Object.entries(pending)) {
      const [d, n] = k.split("|");
      if (n !== name) continue;
      const set = new Set(merged.get(d) ?? []);
      if (v) set.add(n);
      else set.delete(n);
      merged.set(d, set);
    }
    return streak(merged, name, today);
  };

  const doneToday = habits.filter((h) => isDone(today, h.name)).length;
  // completion only counts days since the log started, so a new routine isn't marked down for empty weeks
  const firstLogged = [...log.keys()].sort()[0];
  const counted = days.filter((d) => firstLogged && d >= firstLogged);
  const ticks = counted.reduce((n, d) => n + habits.filter((h) => isDone(d, h.name)).length, 0);
  const rate = counted.length && habits.length ? Math.round((ticks / (counted.length * habits.length)) * 100) : 0;
  const perfect = days.filter((d) => habits.length > 0 && habits.every((h) => isDone(d, h.name))).length;

  const header = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <div className="mr-auto min-w-0">
        <h2 className="text-[clamp(20px,2.2vw,28px)] leading-tight font-[800] text-ink">Daily routine</h2>
        <div className="text-sm text-muted">{formatLongDate(today)}</div>
      </div>
      <RoutinePicker path={routinePath} auto={!routineSetting} />
      {!editing && (
        <Button size="sm" onClick={() => setEditing(true)}>
          ✎ EDIT ROUTINE
        </Button>
      )}
      <StatusText status={status} />
    </div>
  );

  if (editing)
    return (
      <div className="flex h-full flex-col gap-3 p-[clamp(12px,2vw,28px)]">
        {header}
        <AlertBar alert={alert} />
        <RoutineEditor
          path={routinePath}
          onClose={() => {
            setAlert(null);
            setEditing(false);
          }}
        />
      </div>
    );

  return (
    <div className="flex min-h-full flex-col gap-4 p-[clamp(12px,2vw,28px)]">
      {header}
      <AlertBar alert={alert} />

      {!routineNote ? (
        <div className="max-w-[640px] rounded-2xl border border-line bg-panel p-6">
          <h3 className="mb-1.5 text-lg font-bold text-ink">No routine note yet</h3>
          <p className="mb-4 text-[15px] text-muted">
            Deskboard reads your checklist from <code className="text-soft">{routinePath}</code>, which isn't in your vault. Create it
            here, or pick another note with the 📄 button above.
          </p>
          <Button variant="primary" onClick={() => setEditing(true)}>
            CREATE ROUTINE
          </Button>
        </div>
      ) : habits.length === 0 ? (
        <div className="max-w-[640px] rounded-2xl border border-line bg-panel p-6">
          <h3 className="mb-1.5 text-lg font-bold text-ink">No habits in this note</h3>
          <p className="mb-4 text-[15px] text-muted">
            Add checklist lines like <code className="text-soft">- [ ] Drink water</code> to <code className="text-soft">{routinePath}</code>.
          </p>
          <Button variant="primary" onClick={() => setEditing(true)}>
            EDIT ROUTINE
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2.5">
            <Stat label="Today" value={`${doneToday} / ${habits.length}`} />
            <Stat
              label={counted.length < DAYS ? `Done since ${firstLogged ? shortDay(firstLogged) : "today"}` : `Done, last ${DAYS} days`}
              value={`${rate}%`}
              hint="Share of all habit-days ticked off"
            />
            <Stat label={`Perfect days (${DAYS}d)`} value={String(perfect)} hint="Days with every habit done" />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-[clamp(14px,2vw,28px)] lg:grid-cols-[minmax(300px,1fr)_minmax(0,1.6fr)]">
            <Checklist groups={groups} today={today} isDone={isDone} toggle={toggle} streakOf={streakOf} />
            <Tracker habits={habits} days={days} today={today} isDone={isDone} toggle={toggle} streakOf={streakOf} />
          </div>
        </>
      )}
    </div>
  );
}

export function HabitsTab() {
  return (
    <VaultGate title="Habits" description="Connect your Obsidian vault to tick off your daily routine and track it over time.">
      <HabitsBody />
    </VaultGate>
  );
}
