import { describe, expect, it } from "vitest";
import type { Note } from "../../vault/types";
import { displayText, openTaskTexts, parseNoteTasks, parseTasks, rebuildLine } from "./tasks";

const note = (path: string, text: string): Note => ({
  path,
  name: path.split("/").pop()!.replace(/\.md$/, ""),
  folder: path.split("/").slice(0, -1).join("/"),
  text,
  mtime: 1,
});

describe("parseNoteTasks", () => {
  const n = note(
    "Daily Updates/2026-11-15.md",
    [
      "## Todo",
      "- [ ] Block download if TC is pending 📅 2026-11-14",
      "  * [/] Review [[Entitlements|entitlement]] rules",
      "- [x] Prevent duplicate entitlement ✅ 2026-11-15",
      "- [-] cancelled",
      "```",
      "- [ ] inside code",
      "```",
      "+ [X] capital X counts as done",
    ].join("\n"),
  );
  const tasks = parseNoteTasks(n);

  it("finds tasks, skipping cancelled ones and code blocks", () => {
    expect(tasks.map((t) => t.status)).toEqual([" ", "/", "x", "x"]);
    expect(tasks.map((t) => t.line)).toEqual([1, 2, 3, 8]);
  });

  it("reads due and done dates and cleans the display text", () => {
    expect(tasks[0].due).toBe("2026-11-14");
    expect(tasks[0].text).toBe("Block download if TC is pending");
    expect(tasks[1].text).toBe("Review entitlement rules");
    expect(tasks[2].doneOn).toBe("2026-11-15");
  });

  it("keeps indentation and bullet", () => {
    expect(tasks[1].indent).toBe("  ");
    expect(tasks[1].bullet).toBe("*");
  });
});

describe("parseTasks", () => {
  it("ignores template folders", () => {
    const tasks = parseTasks([note("office/Templates/Daily.md", "- [ ] t"), note("a.md", "- [ ] real")]);
    expect(tasks.map((t) => t.text)).toEqual(["real"]);
  });
});

describe("rebuildLine", () => {
  const base = { indent: "  ", bullet: "-", body: "Ship it 📅 2026-11-20" };

  it("adds a done stamp and keeps other dates", () => {
    expect(rebuildLine(base, "x", "2026-11-15")).toBe("  - [x] Ship it 📅 2026-11-20 ✅ 2026-11-15");
  });

  it("removes the done stamp when reopened", () => {
    expect(rebuildLine({ ...base, body: "Ship it ✅ 2026-11-10" }, "/", "2026-11-15")).toBe("  - [/] Ship it");
  });

  it("replaces an old stamp instead of adding a second one", () => {
    expect(rebuildLine({ ...base, body: "Ship ✅ 2026-11-01" }, "x", "2026-11-15")).toBe("  - [x] Ship ✅ 2026-11-15");
  });
});

describe("helpers", () => {
  it("displayText handles empty bodies and emoji dates without leaving broken characters", () => {
    expect(displayText("📅 2026-11-14")).toBe("(empty task)");
    expect(displayText("x 📅 2026-11-14 y")).not.toMatch(/�|[\uD800-\uDFFF]/);
  });

  it("openTaskTexts lists unchecked tasks only", () => {
    expect(openTaskTexts("- [ ] a\n- [x] b\n- [/] c\n  - [ ] d ")).toEqual(["a", "d"]);
  });
});
