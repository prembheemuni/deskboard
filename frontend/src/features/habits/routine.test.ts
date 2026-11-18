import { describe, expect, it } from "vitest";
import { lastDays, LOG_HEADER, logPathFor, parseLog, parseRoutine, plainText, setHabitDone, streak } from "./routine";

const ROUTINE = `# Orizonova — AI Learning Routine

A lightweight system to stay up to date with AI in **10 minutes a day**.

---

# 🌅 Every Morning (7 minutes)

- [ ] **Read The Rundown AI** *(5 min)*
  - Daily summary of the biggest AI news, model launches, and tools.

- [ ] **Check X (2 min)**
  - @OpenAI
  - @AnthropicAI

---

# 📅 Weekly (20 minutes)

- [x] **Watch Matt Wolfe**
  - Best weekly roundup of AI tools.

# 📚 Recommended Sources

## Newsletters
- The Rundown AI
- TLDR AI

\`\`\`
- [ ] not a habit, it's in a code block
\`\`\`
`;

describe("parseRoutine", () => {
  it("reads checkbox lines as habits, grouped by heading, with their indented notes", () => {
    const groups = parseRoutine(ROUTINE);
    expect(groups.map((g) => g.title)).toEqual(["🌅 Every Morning (7 minutes)", "📅 Weekly (20 minutes)"]);
    expect(groups[0].habits).toEqual([
      { name: "Read The Rundown AI (5 min)", details: ["Daily summary of the biggest AI news, model launches, and tools."] },
      { name: "Check X (2 min)", details: ["@OpenAI", "@AnthropicAI"] },
    ]);
    expect(groups[1].habits.map((h) => h.name)).toEqual(["Watch Matt Wolfe"]); // ticked in the file still counts
  });

  it("ignores plain bullets, code blocks and frontmatter, and keeps names unique", () => {
    const groups = parseRoutine("---\ntags: [x]\n---\n- [ ] Walk\n- Walk the dog\n- [ ] Walk\n```\n- [ ] Nope\n```\n");
    expect(groups).toEqual([{ title: "", habits: [{ name: "Walk", details: [] }, { name: "Walk (2)", details: [] }] }]);
  });

  it("strips Markdown from names", () => {
    expect(plainText("**Read** [[Some Note|the note]] and `code`; *(5 min)*")).toBe("Read the note and code, (5 min)");
    expect(plainText("keep snake_case_names")).toBe("keep snake_case_names");
  });
});

describe("habit log", () => {
  it("adds, updates and removes a day's line, newest first", () => {
    let log = setHabitDone("", "2026-11-16", "Walk", true);
    expect(log).toBe(`${LOG_HEADER}\n- 2026-11-16: Walk\n`);

    log = setHabitDone(log, "2026-11-17", "Walk", true);
    log = setHabitDone(log, "2026-11-17", "Read", true);
    log = setHabitDone(log, "2026-11-15", "Read", true);
    expect(log.split("\n").filter((l) => l.startsWith("- "))).toEqual([
      "- 2026-11-17: Walk; Read",
      "- 2026-11-16: Walk",
      "- 2026-11-15: Read",
    ]);

    log = setHabitDone(log, "2026-11-16", "Walk", false); // nothing left that day: line goes
    expect(log).not.toContain("2026-11-16");
    expect(setHabitDone(log, "2026-11-17", "Walk", true)).toBe(log); // already done: unchanged

    const parsed = parseLog(log);
    expect([...parsed.get("2026-11-17")!]).toEqual(["Walk", "Read"]);
  });

  it("counts streaks up to today, or up to yesterday while today is still open", () => {
    const log = parseLog("- 2026-11-14: A\n- 2026-11-15: A; B\n- 2026-11-16: A; B\n- 2026-11-17: B\n");
    expect(streak(log, "B", "2026-11-17")).toBe(3);
    expect(streak(log, "A", "2026-11-17")).toBe(3); // today not ticked yet: counts to yesterday
    expect(streak(log, "C", "2026-11-17")).toBe(0);
  });

  it("lists the last N days and puts the log next to the routine", () => {
    expect(lastDays("2026-11-17", 3)).toEqual(["2026-11-15", "2026-11-16", "2026-11-17"]);
    expect(logPathFor("office/Daily Routine/Daily Routine.md")).toBe("office/Daily Routine/Habit Log.md");
    expect(logPathFor("Daily Routine.md")).toBe("Habit Log.md");
  });
});
