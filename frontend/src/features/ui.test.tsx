// Component tests: the React UI wired to the stores, against an in-memory vault.

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../App";
import { useUI } from "../app/ui";
import { addDaysKey, dayKey } from "../lib/dates";
import { dir, file, serveVault, type FakeDir } from "../test/fakeVault";
import { resetVaultForTests, useVault } from "../vault/store";
import { BoardTab } from "./board/BoardTab";
import { HabitsTab } from "./habits/HabitsTab";
import { resetHabitsForTests } from "./habits/store";
import { useBoard } from "./board/store";
import { ObsidianTab } from "./obsidian/ObsidianTab";
import { ScreensaverTab } from "./screensaver/ScreensaverTab";
import { TimerTab } from "./timer/TimerTab";
import { resetTimerForTests } from "./timer/useTimer";
import { TodayTab } from "./today/TodayTab";
import { resetTodayForTests, useToday } from "./today/store";

const today = dayKey();
const yesterday = addDaysKey(today, -1);
let vault: FakeDir;

beforeEach(async () => {
  vault = dir("obsidian", {
    "Daily Updates": dir("Daily Updates", {
      [`${yesterday}.md`]: file(`${yesterday}.md`, "## Todo\n- [ ] Carry me over\n"),
      [`${today}.md`]: file(`${today}.md`, "## Todo\n- [ ] Ship Deskboard\n"),
    }),
    office: dir("office", { "PM.md": file("PM.md", "Overview. See [[Entitlements]]."), "Entitlements.md": file("Entitlements.md", "Rules") }),
  });
  resetVaultForTests();
  resetTodayForTests();
  resetTimerForTests();
  useBoard.setState({ status: { text: "" }, alert: null, search: "", showAllDone: false });
  useUI.setState({ notePath: null, sideCollapsed: false, openFolders: ["office"] });
  serveVault(vault);
  await act(() => useVault.getState().refresh());
});

describe("Habits", () => {
  const ROUTINE = "# Morning\n- [ ] **Read news** *(5 min)*\n  - The Rundown AI\n- [ ] Walk\n\n## Sources\n- Not a habit\n";

  beforeEach(async () => {
    resetHabitsForTests();
    vault.children.office = dir("office", {
      "Daily Routine": dir("Daily Routine", { "Daily Routine.md": file("Daily Routine.md", ROUTINE) }),
    });
    await act(() => useVault.getState().refresh());
  });

  it("shows the routine's checklist and writes ticks to the habit log", async () => {
    render(<HabitsTab />);
    expect(screen.getByText("office/Daily Routine/Daily Routine.md", { exact: false })).toBeInTheDocument();
    const read = screen.getByRole("checkbox", { name: /Read news \(5 min\)/ });
    expect(screen.getByText("The Rundown AI")).toBeInTheDocument();
    expect(screen.queryByText("Not a habit")).not.toBeInTheDocument();
    expect(read).toHaveAttribute("aria-checked", "false");

    fireEvent.click(read);
    expect(read).toHaveAttribute("aria-checked", "true"); // straight away, while saving
    await waitFor(() => expect(vault.file("office/Daily Routine/Habit Log.md")?.text).toContain(`- ${today}: Read news (5 min)`));
    fireEvent.click(screen.getByRole("checkbox", { name: /Walk/ }));
    await waitFor(() => expect(vault.file("office/Daily Routine/Habit Log.md")?.text).toContain(`- ${today}: Read news (5 min); Walk`));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    // the routine note itself is never changed by ticking
    expect(vault.file("office/Daily Routine/Daily Routine.md")?.text).toBe(ROUTINE);
  });

  it("fixes a past day from the 30-day tracker", async () => {
    render(<HabitsTab />);
    const cells = screen.getAllByRole("button", { name: /^Walk on / });
    expect(cells).toHaveLength(30);
    fireEvent.click(cells[28]); // yesterday
    await waitFor(() => expect(vault.file("office/Daily Routine/Habit Log.md")?.text).toContain(`- ${yesterday}: Walk`));
  });

  it("edits the routine note", async () => {
    render(<HabitsTab />);
    fireEvent.click(screen.getByRole("button", { name: /EDIT ROUTINE/ }));
    const editor = screen.getByRole("textbox", { name: "Routine note" });
    fireEvent.change(editor, { target: { value: `${ROUTINE}- [ ] Stretch\n` } });
    fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Stretch/ })).toBeInTheDocument());
    expect(vault.file("office/Daily Routine/Daily Routine.md")?.text).toContain("- [ ] Stretch");
  });

  it("offers to create a routine when there isn't one", async () => {
    delete vault.children.office;
    await act(() => useVault.getState().refresh());
    render(<HabitsTab />);
    fireEvent.click(screen.getByRole("button", { name: "CREATE ROUTINE" }));
    fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
    await waitFor(() => expect(vault.file("Daily Routine.md")?.text).toContain("- [ ] Drink a glass of water"));
    expect(screen.getByRole("checkbox", { name: /Drink a glass of water/ })).toBeInTheDocument();
  });
});

describe("Text size", () => {
  it("toggles between large and compact and remembers the choice", () => {
    useUI.setState({ textSize: "large" });
    useUI.getState().toggleTextSize();
    expect(document.documentElement.dataset.textSize).toBe("compact");
    expect(localStorage.getItem("deskTextSize")).toBe("compact");
    useUI.getState().toggleTextSize();
    expect(document.documentElement.dataset.textSize).toBe("large");
    expect(localStorage.getItem("deskTextSize")).toBe("large");
  });
});

describe("Screensaver", () => {
  it("shows the clock, and the countdown while the timer is running", () => {
    render(<><TimerTab /><ScreensaverTab /></>);
    const saver = screen.getByTestId("bouncing-clock");
    expect(within(saver).queryByText("25:00")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "START" }));
    expect(within(saver).getByText("25:00")).toBeInTheDocument();
    expect(within(saver).getByText(/FOCUS SESSION ·/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "PAUSE" }));
    expect(within(saver).queryByText("25:00")).not.toBeInTheDocument();
  });

  it("hides the tabs in expand (fullscreen) mode", () => {
    const setFullscreen = (el: Element | null) => {
      Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => el });
      act(() => void document.dispatchEvent(new Event("fullscreenchange")));
    };
    useUI.getState().setTab("saverTab");
    render(<App />);
    const tabs = screen.getByRole("tablist", { hidden: true });
    expect(tabs).not.toHaveAttribute("hidden");

    setFullscreen(document.documentElement);
    expect(tabs).toHaveAttribute("hidden");

    act(() => useUI.getState().setTab("timerTab")); // other tabs keep their tabs in fullscreen
    expect(tabs).not.toHaveAttribute("hidden");

    act(() => useUI.getState().setTab("saverTab"));
    setFullscreen(null);
    expect(tabs).not.toHaveAttribute("hidden");
  });

  it("switches between the clock and the cat, and remembers the choice", () => {
    const { unmount } = render(<ScreensaverTab />);
    expect(screen.getByTestId("bouncing-clock")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Cat" }));
    expect(screen.getByTestId("cat-canvas")).toBeInTheDocument();
    expect(screen.queryByTestId("bouncing-clock")).not.toBeInTheDocument();
    unmount();

    render(<ScreensaverTab />);
    expect(screen.getByRole("radio", { name: "Cat" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Clock" }));
    expect(screen.getByTestId("bouncing-clock")).toBeInTheDocument();
  });
});

describe("Timer", () => {
  it("starts, pauses and switches modes", () => {
    render(<TimerTab />);
    expect(screen.getByText("25:00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "START" }));
    expect(screen.getByRole("button", { name: "PAUSE" })).toBeInTheDocument();
    expect(screen.getByText("FOCUS SESSION IN PROGRESS")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "SHORT BREAK" }));
    expect(screen.getByText("05:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "START" })).toBeInTheDocument();
  });
});

describe("Task board", () => {
  it("shows tasks from daily notes and moves one with ▶", async () => {
    render(<BoardTab />);
    const todo = screen.getByTestId("column-To do");
    expect(within(todo).getByText("Ship Deskboard")).toBeInTheDocument();
    expect(screen.queryByText("office task")).not.toBeInTheDocument();

    const card = within(todo).getByText("Ship Deskboard").closest("[data-testid=task-card]") as HTMLElement;
    fireEvent.click(within(card).getByTitle("Move to Doing"));

    await waitFor(() => expect(vault.file(`Daily Updates/${today}.md`)!.text).toContain("- [/] Ship Deskboard"));
    await waitFor(() => expect(within(screen.getByTestId("column-Doing")).getByText("Ship Deskboard")).toBeInTheDocument());
  });

  it("ticking the checkbox marks the task done with today's date", async () => {
    render(<BoardTab />);
    const card = screen.getByText("Carry me over").closest("[data-testid=task-card]") as HTMLElement;
    fireEvent.click(within(card).getByRole("checkbox"));
    await waitFor(() =>
      expect(vault.file(`Daily Updates/${yesterday}.md`)!.text).toContain(`- [x] Carry me over ✅ ${today}`),
    );
  });
});

describe("Today", () => {
  it("loads today's note, offers carry-over, and saves with Ctrl+S", async () => {
    render(<TodayTab />);
    const editor = (await screen.findByPlaceholderText("What are you working on today?")) as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toBe("## Todo\n- [ ] Ship Deskboard\n"));

    fireEvent.click(screen.getByRole("button", { name: "+ Carry me over" }));
    expect(editor.value).toContain("## Carried over\n- [ ] Carry me over");

    fireEvent.keyDown(editor, { key: "s", ctrlKey: true });
    await waitFor(() => expect(vault.file(`Daily Updates/${today}.md`)!.text).toContain("Carry me over"));
    expect(useToday.getState().dirty).toBe(false);
  });

  it("adds a Thoughts section with + THOUGHTS", async () => {
    render(<TodayTab />);
    const editor = (await screen.findByPlaceholderText("What are you working on today?")) as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toBe("## Todo\n- [ ] Ship Deskboard\n"));
    editor.setSelectionRange(editor.value.length, editor.value.length);

    fireEvent.click(screen.getByRole("button", { name: "+ THOUGHTS" }));
    expect(editor.value).toBe("## Todo\n- [ ] Ship Deskboard\n\n## Thoughts\n- ");
  });
});

describe("Obsidian", () => {
  it("opens a note and follows a wikilink", async () => {
    render(<ObsidianTab />);
    fireEvent.click(screen.getByRole("button", { name: "PM" }));
    expect(await screen.findByRole("heading", { level: 1, name: "PM" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Entitlements" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Entitlements" })).toBeInTheDocument();
  });
});
