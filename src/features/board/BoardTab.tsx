import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMemo, useState } from "react";
import { useUI } from "../../app/ui";
import { AlertBar, Chip, StatusText } from "../../components/ui";
import { VaultGate } from "../../components/VaultGate";
import { cx } from "../../lib/cx";
import { addDaysKey, dayKey, formatShortDate } from "../../lib/dates";
import { useVault } from "../../vault/store";
import { cleanFolder, useToday } from "../today/store";
import { useBoard } from "./store";
import {
  STATUS_NAMES,
  STATUS_ORDER,
  compareDone,
  compareOpen,
  parseTasks,
  type Task,
  type TaskStatus,
} from "./tasks";

const EMPTY_TEXT: Record<TaskStatus, string> = {
  " ": "No open tasks. 🎉",
  "/": "Drag a task here when you start it.",
  x: "Nothing finished in the last 7 days.",
};

function TaskCardBody({ task, todayKey }: { task: Task; todayKey: string }) {
  const openNote = useUI((s) => s.openNote);
  return (
    <div className="min-w-0 flex-1">
      <div className={cx("text-card leading-snug break-words", task.status === "x" && "text-muted line-through")}>
        {task.text}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px] text-[#8a97ac]">
        <button
          type="button"
          title={`Open ${task.path}`}
          onClick={() => openNote(task.path, true)}
          className="max-w-full truncate rounded-md bg-raised px-2 py-0.5 text-[13px] font-semibold"
        >
          📄 {task.noteName || "(untitled)"}
        </button>
        {task.due && task.status !== "x" && (
          <Chip tone={task.due < todayKey ? "overdue" : task.due === todayKey ? "today" : "plain"}>
            📅 {task.due === todayKey ? "today" : formatShortDate(task.due)}
          </Chip>
        )}
        {task.doneOn && task.status === "x" && (
          <Chip>✅ {task.doneOn === todayKey ? "today" : formatShortDate(task.doneOn)}</Chip>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, todayKey }: { task: Task; todayKey: string }) {
  const moveTask = useBoard((s) => s.moveTask);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { task } });
  const idx = STATUS_ORDER.indexOf(task.status);
  const prev = STATUS_ORDER[idx - 1];
  const next = STATUS_ORDER[idx + 1];

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-testid="task-card"
      className={cx(
        "flex cursor-grab items-start gap-3 rounded-xl border border-line bg-panel px-3.5 py-3 touch-none",
        isDragging && "opacity-40",
      )}
    >
      <input
        type="checkbox"
        checked={task.status === "x"}
        title={task.status === "x" ? "Mark as not done" : "Mark as done"}
        onChange={() => void moveTask(task.id, task.status === "x" ? " " : "x")}
        className="mt-1 size-[22px] shrink-0 cursor-pointer accent-progress"
      />
      <TaskCardBody task={task} todayKey={todayKey} />
      <div className="flex shrink-0 flex-col gap-1">
        {prev !== undefined && (
          <button type="button" title={`Move to ${STATUS_NAMES[prev]}`} onClick={() => void moveTask(task.id, prev)}
            className="rounded-lg bg-panel px-2.5 py-1 text-[13px] text-soft">◀</button>
        )}
        {next !== undefined && (
          <button type="button" title={`Move to ${STATUS_NAMES[next]}`} onClick={() => void moveTask(task.id, next)}
            className="rounded-lg bg-panel px-2.5 py-1 text-[13px] text-soft">▶</button>
        )}
      </div>
    </div>
  );
}

function Column({
  status,
  tasks,
  hiddenDone,
  todayKey,
}: {
  status: TaskStatus;
  tasks: Task[];
  hiddenDone: number;
  todayKey: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      data-testid={`column-${STATUS_NAMES[status]}`}
      className={cx(
        "flex min-h-0 snap-start flex-col rounded-2xl border p-3 transition-colors",
        isOver ? "border-brand-line bg-brand-tint" : "border-line bg-deep",
      )}
    >
      <h3 className="m-0 mb-2.5 flex items-center justify-between text-[clamp(18px,1.4vw,24px)] font-bold">
        {STATUS_NAMES[status]}
        <span className="text-[0.8em] font-[650] text-muted">{tasks.length}</span>
      </h3>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} todayKey={todayKey} />
        ))}
        {!tasks.length && <div className="px-1.5 py-5 text-center text-sm text-faint">{EMPTY_TEXT[status]}</div>}
        {status === "x" && hiddenDone > 0 && (
          <div className="px-1.5 py-2 text-center text-sm text-faint">
            {hiddenDone} older done task{hiddenDone > 1 ? "s" : ""} hidden (tick “Show all done” to see them)
          </div>
        )}
      </div>
    </section>
  );
}

function AddTask() {
  const addTask = useBoard((s) => s.addTask);
  const [value, setValue] = useState("");
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={async (e) => {
        if (e.key !== "Enter" || !value.trim()) return;
        e.preventDefault();
        const text = value.trim();
        setValue("");
        if (!(await addTask(text))) setValue((v) => v || text);
      }}
      placeholder="Add a task to today's daily note…  (Enter)"
      className="min-w-0 flex-[2_1_280px] rounded-xl border border-line bg-panel px-3.5 py-3 text-base text-ink"
    />
  );
}

function BoardBody() {
  const notes = useVault((s) => s.notes);
  const folder = useToday((s) => s.folder);
  const { search, setSearch, showAllDone, setShowAllDone, status, alert, moveTask } = useBoard();
  const [dragging, setDragging] = useState<Task | null>(null);
  const sensors = useSensors(
    // a small drag distance keeps clicks on the card's buttons and checkbox working
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const todayKey = dayKey();
  const { columns, hiddenDone } = useMemo(() => {
    const f = cleanFolder(folder);
    // the board shows tasks from the daily notes folder (the same folder the Today tab uses)
    const all = parseTasks(notes).filter((t) => t.folder === f || t.folder.startsWith(`${f}/`));
    const q = search.trim().toLowerCase();
    const weekAgo = addDaysKey(todayKey, -7);
    let hidden = 0;

    const shown = all.filter((t) => {
      if (q && !t.text.toLowerCase().includes(q) && !t.noteName.toLowerCase().includes(q)) return false;
      if (t.status === "x" && !showAllDone && !(t.doneOn && t.doneOn >= weekAgo)) {
        hidden++;
        return false;
      }
      return true;
    });

    const cols = Object.fromEntries(
      STATUS_ORDER.map((s) => [s, shown.filter((t) => t.status === s).sort(s === "x" ? compareDone : compareOpen)]),
    ) as Record<TaskStatus, Task[]>;
    return { columns: cols, hiddenDone: hidden };
  }, [notes, folder, search, showAllDone, todayKey]);

  const onDragStart = (e: DragStartEvent) => setDragging((e.active.data.current?.task as Task) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const task = e.active.data.current?.task as Task | undefined;
    const to = e.over?.id as TaskStatus | undefined;
    if (task && to !== undefined && to !== task.status) void moveTask(task.id, to);
  };

  return (
    <div className="flex h-full flex-col gap-3 p-[clamp(12px,2vw,28px)]">
      <div className="flex flex-wrap items-center gap-2.5">
        <AddTask />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter tasks…"
          className="min-w-0 flex-[0_1_220px] rounded-xl border border-line bg-panel px-3.5 py-3 text-[15px] text-ink"
        />
        <label
          className="inline-flex cursor-pointer items-center gap-2 text-sm whitespace-nowrap text-muted"
          title="Done shows the last 7 days. Tick to show every finished task."
        >
          <input type="checkbox" checked={showAllDone} onChange={(e) => setShowAllDone(e.target.checked)} />
          Show all done
        </label>
        <StatusText status={status} className="ml-auto" />
      </div>

      <AlertBar alert={alert} />

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-3.5 portrait:snap-x portrait:snap-mandatory portrait:grid-cols-[repeat(3,86%)] portrait:overflow-x-auto">
          {STATUS_ORDER.map((s) => (
            <Column key={s} status={s} tasks={columns[s]} hiddenDone={hiddenDone} todayKey={todayKey} />
          ))}
        </div>
        <DragOverlay>
          {dragging && (
            <div className="flex cursor-grabbing items-start gap-3 rounded-xl border border-brand-line bg-panel px-3.5 py-3 shadow-2xl">
              <TaskCardBody task={dragging} todayKey={todayKey} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

export function BoardTab() {
  return (
    <VaultGate title="Task board" description="Connect your Obsidian vault to see the - [ ] tasks from your daily notes on one board.">
      <BoardBody />
    </VaultGate>
  );
}
