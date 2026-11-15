// End-to-end behaviour of the vault, Today and Tasks stores against an in-memory vault.

import { beforeEach, describe, expect, it } from "vitest";
import { addDaysKey, dayKey } from "../lib/dates";
import { dir, file, serveVault, serverDown, type FakeDir } from "../test/fakeVault";
import { resetVaultForTests, useVault } from "../vault/store";
import { useBoard } from "./board/store";
import { parseTasks } from "./board/tasks";
import { resetTodayForTests, useToday } from "./today/store";

const today = dayKey();
const yesterday = addDaysKey(today, -1);
let vault: FakeDir;

async function connect(v: FakeDir) {
  resetVaultForTests();
  resetTodayForTests();
  useBoard.setState({ status: { text: "" }, alert: null });
  serveVault(v);
  await useVault.getState().refresh();
}

const taskId = (text: string) => parseTasks(useVault.getState().notes).find((t) => t.text === text)!.id;

beforeEach(async () => {
  vault = dir("obsidian", {
    "Daily Updates": dir("Daily Updates", {
      [`${yesterday}.md`]: file(`${yesterday}.md`, "## Todo\r\n- [ ] Finish system design video\r\n- [/] Review bundles popup\r\n"),
      [`${today}.md`]: file(`${today}.md`, "## Todo\n- [ ] Call Venkatesh\n"),
    }),
    office: dir("office", { "Known issues.md": file("Known issues.md", "- [ ] office task") }),
    ".obsidian": dir(".obsidian", { "app.md": file("app.md", "hidden") }),
  });
  await connect(vault);
});

describe("vault", () => {
  it("reads notes, skipping hidden folders, with \\n line endings", () => {
    const paths = useVault.getState().notes.map((n) => n.path);
    expect(paths).toEqual([`Daily Updates/${yesterday}.md`, `Daily Updates/${today}.md`, "office/Known issues.md"]);
    expect(useVault.getState().notes[0].text).not.toContain("\r");
    expect(useVault.getState().status).toBe("ready");
    expect(useVault.getState().name).toBe("obsidian");
  });

  it("follows changes made in Obsidian", async () => {
    vault.file("office/Known issues.md")!.text = "- [ ] edited elsewhere";
    vault.file("office/Known issues.md")!.mtime += 10_000;
    (vault.children.office as FakeDir).children["New.md"] = file("New.md", "new note");
    delete (vault.children["Daily Updates"] as FakeDir).children[`${yesterday}.md`];

    await useVault.getState().applyChanges([
      { kind: "changed", path: "office/Known issues.md" },
      { kind: "changed", path: "office/New.md" },
      { kind: "deleted", path: `Daily Updates/${yesterday}.md` },
    ]);

    const notes = useVault.getState().notes;
    expect(notes.map((n) => n.path)).toEqual([`Daily Updates/${today}.md`, "office/Known issues.md", "office/New.md"]);
    expect(notes[1].text).toBe("- [ ] edited elsewhere");
  });

  it("says so when the server isn't running", async () => {
    serverDown();
    await useVault.getState().refresh();
    expect(useVault.getState().status).toBe("offline");
  });
});

describe("Today", () => {
  it("loads today's note and saves edits", async () => {
    await useToday.getState().load();
    expect(useToday.getState().text).toBe("## Todo\n- [ ] Call Venkatesh\n");

    useToday.getState().setText("## Todo\n- [ ] Call Venkatesh\n- [ ] New\n");
    await useToday.getState().saveNow();

    expect(vault.file(`Daily Updates/${today}.md`)!.text).toContain("- [ ] New");
    expect(useToday.getState().dirty).toBe(false);
    expect(useToday.getState().status.text).toMatch(/^Saved/);
  });

  it("doesn't create a file just by visiting an empty day", async () => {
    await useToday.getState().go(-5);
    useToday.getState().setText("   ");
    await useToday.getState().saveNow();
    expect(vault.file(`Daily Updates/${addDaysKey(today, -5)}.md`)).toBeUndefined();
  });

  it("asks before overwriting a note changed in Obsidian", async () => {
    await useToday.getState().load();
    const disk = vault.file(`Daily Updates/${today}.md`)!;
    disk.text = "edited in obsidian";
    disk.mtime += 10_000;

    useToday.getState().setText("my version");
    await useToday.getState().saveNow();
    expect(disk.text).toBe("edited in obsidian");
    expect(useToday.getState().alert?.message).toMatch(/changed in Obsidian/);

    const keepMine = useToday.getState().alert!.actions.find((a) => a.label === "KEEP MINE")!;
    keepMine.run();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(disk.text).toBe("my version");
  });

  it("never re-creates a missing folder silently", async () => {
    await useToday.getState().setFolder("Moved Folder");
    useToday.getState().setText("hello");
    await useToday.getState().saveNow();
    expect(vault.children["Moved Folder"]).toBeUndefined();
    expect(useToday.getState().alert?.actions[0].label).toBe("CREATE IT");

    useToday.getState().alert!.actions[0].run();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(vault.file(`Moved Folder/${today}.md`)?.text).toBe("hello");
  });
});

describe("Task board", () => {
  it("moves a task by rewriting only its line, keeping CRLF endings", async () => {
    await useBoard.getState().moveTask(taskId("Finish system design video"), "/");
    expect(vault.file(`Daily Updates/${yesterday}.md`)!.text).toBe(
      "## Todo\r\n- [/] Finish system design video\r\n- [/] Review bundles popup\r\n",
    );
  });

  it("stamps the date when done and removes it when reopened", async () => {
    await useBoard.getState().moveTask(taskId("Review bundles popup"), "x");
    const f = vault.file(`Daily Updates/${yesterday}.md`)!;
    expect(f.text).toContain(`- [x] Review bundles popup ✅ ${today}`);

    await useBoard.getState().moveTask(taskId("Review bundles popup"), " ");
    expect(f.text).toContain("- [ ] Review bundles popup\r\n");
  });

  it("runs quick clicks one after another without losing any", async () => {
    const a = taskId("Finish system design video");
    const b = taskId("Review bundles popup");
    await Promise.all([useBoard.getState().moveTask(a, "/"), useBoard.getState().moveTask(b, "x")]);
    const text = vault.file(`Daily Updates/${yesterday}.md`)!.text;
    expect(text).toContain("- [/] Finish system design video");
    expect(text).toContain(`- [x] Review bundles popup ✅ ${today}`);
  });

  it("saves unsaved Today typing first, then updates the Today editor", async () => {
    await useToday.getState().load();
    useToday.getState().setText("## Todo\n- [ ] Call Venkatesh\n- [ ] typed but not saved\n");

    await useBoard.getState().moveTask(taskId("Call Venkatesh"), "x");

    const disk = vault.file(`Daily Updates/${today}.md`)!.text;
    expect(disk).toContain("- [ ] typed but not saved");
    expect(disk).toContain(`- [x] Call Venkatesh ✅ ${today}`);
    expect(useToday.getState().text).toBe(disk);
    expect(useToday.getState().dirty).toBe(false);
  });

  it("adds a task under ## Todo in today's note", async () => {
    await useToday.getState().load();
    await useBoard.getState().addTask("Write the README");
    expect(vault.file(`Daily Updates/${today}.md`)!.text).toBe("## Todo\n- [ ] Call Venkatesh\n- [ ] Write the README\n");
  });

  it("refuses to edit a line that changed in Obsidian", async () => {
    const id = taskId("Finish system design video");
    vault.file(`Daily Updates/${yesterday}.md`)!.text = "## Todo\n- [ ] Something else entirely\n";
    await useBoard.getState().moveTask(id, "x");
    expect(useBoard.getState().status).toEqual({ text: expect.stringMatching(/changed in Obsidian/), error: true });
    expect(vault.file(`Daily Updates/${yesterday}.md`)!.text).toBe("## Todo\n- [ ] Something else entirely\n");
  });
});
