// Component tests: the React UI wired to the stores, against an in-memory vault.

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useUI } from "../app/ui";
import { addDaysKey, dayKey } from "../lib/dates";
import { dir, file, serveVault, type FakeDir } from "../test/fakeVault";
import { resetVaultForTests, useVault } from "../vault/store";
import { BoardTab } from "./board/BoardTab";
import { useBoard } from "./board/store";
import { ObsidianTab } from "./obsidian/ObsidianTab";
import { TimerTab } from "./timer/TimerTab";
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
  useBoard.setState({ status: { text: "" }, alert: null, search: "", showAllDone: false });
  useUI.setState({ notePath: null, sideCollapsed: false, openFolders: ["office"] });
  serveVault(vault);
  await act(() => useVault.getState().refresh());
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
