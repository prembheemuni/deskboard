import { describe, expect, it } from "vitest";
import { addCarriedTasks, insertUnderHeading, listEnter, previewLine, snippetInsertion } from "./text";

describe("insertUnderHeading", () => {
  it("adds the heading at the end when missing", () => {
    expect(insertUnderHeading("", "## Todo", "- [ ] a")).toBe("## Todo\n- [ ] a\n");
    expect(insertUnderHeading("hello\n\n", "## Todo", "- [ ] a")).toBe("hello\n\n## Todo\n- [ ] a\n");
  });

  it("inserts after the existing list under the heading", () => {
    const text = "## Todo\n- [ ] one\n- [x] two\n\n## Notes\nx";
    expect(insertUnderHeading(text, "## Todo", "- [ ] three")).toBe(
      "## Todo\n- [ ] one\n- [x] two\n- [ ] three\n\n## Notes\nx",
    );
  });

  it("matches the heading case-insensitively", () => {
    expect(insertUnderHeading("## todo\n", "## Todo", "- [ ] a")).toBe("## todo\n- [ ] a\n");
  });
});

describe("addCarriedTasks", () => {
  it("creates the heading once and adds below it", () => {
    const once = addCarriedTasks("note", ["a"]);
    expect(once).toBe("note\n\n## Carried over\n- [ ] a\n");
    expect(addCarriedTasks(once, ["b"])).toBe("note\n\n## Carried over\n- [ ] b\n- [ ] a\n");
  });
});

describe("listEnter", () => {
  it("continues bullets, tasks and numbers", () => {
    expect(listEnter("- item", 6)).toEqual({ kind: "continue", insert: "\n- " });
    expect(listEnter("  - [x] done", 12)).toEqual({ kind: "continue", insert: "\n  - [ ] " });
    expect(listEnter("3. third", 8)).toEqual({ kind: "continue", insert: "\n4. " });
  });

  it("ends the list on an empty item", () => {
    expect(listEnter("a\n- ", 4)).toEqual({ kind: "end-list", from: 2, to: 4 });
  });

  it("does nothing outside lists", () => {
    expect(listEnter("plain text", 10)).toEqual({ kind: "none" });
  });
});

describe("snippetInsertion", () => {
  it("puts headings in their own block", () => {
    expect(snippetInsertion("text", "## Todo\n")).toBe("\n\n## Todo\n");
    expect(snippetInsertion("text\n", "## Todo\n")).toBe("\n## Todo\n");
    expect(snippetInsertion("", "## Todo\n")).toBe("## Todo\n");
  });

  it("starts other snippets on a new line unless inline", () => {
    expect(snippetInsertion("abc", "- [ ] ")).toBe("\n- [ ] ");
    expect(snippetInsertion("abc", "**10:00** ", true)).toBe("**10:00** ");
  });
});

describe("previewLine", () => {
  it("skips blank lines and strips markers", () => {
    expect(previewLine("\n\n## Todo\n- [ ] x")).toBe("Todo");
    expect(previewLine("- [ ] fix it")).toBe("fix it");
    expect(previewLine("")).toBe("");
  });
});
