import { describe, expect, it } from "vitest";
import type { Note } from "./types";
import { findNote, obsidianUrl, prepareMarkdown, stripFrontmatter } from "./wikilinks";

const n = (path: string): Note => ({
  path,
  name: path.split("/").pop()!.replace(/\.md$/, ""),
  folder: path.split("/").slice(0, -1).join("/"),
  text: "",
  mtime: 1,
});

describe("prepareMarkdown", () => {
  it("turns wikilinks into wikilink: links", () => {
    expect(prepareMarkdown("see [[Database modelling problems]]")).toBe(
      "see [Database modelling problems](wikilink:Database%20modelling%20problems)",
    );
    expect(prepareMarkdown("[[PM|the PM note]] and ![[Img]]")).toBe(
      "[the PM note](wikilink:PM) and [Img](wikilink:Img)",
    );
    expect(prepareMarkdown("[[Routing#Params]]")).toBe("[Routing#Params](wikilink:Routing)");
  });

  it("turns #tags into code but leaves headings alone", () => {
    expect(prepareMarkdown("# Title\nwork #backend")).toBe("# Title\nwork `#backend`");
  });

  it("does not touch fenced code", () => {
    const src = "```\n[[not a link]] #nottag\n```\n[[link]]";
    expect(prepareMarkdown(src)).toBe("```\n[[not a link]] #nottag\n```\n[link](wikilink:link)");
  });

  it("strips frontmatter", () => {
    expect(stripFrontmatter("---\ntags: x\n---\nbody")).toBe("body");
  });
});

describe("findNote", () => {
  const notes = [n("office/cadence/PM.md"), n("personal/Backend/6. Routing.md"), n("PM.md")];

  it("prefers an exact path, then name, then path ending", () => {
    expect(findNote(notes, "office/cadence/PM")?.path).toBe("office/cadence/PM.md");
    expect(findNote(notes, "6. routing")?.path).toBe("personal/Backend/6. Routing.md");
    expect(findNote(notes, "Backend/6. Routing")?.path).toBe("personal/Backend/6. Routing.md");
    expect(findNote(notes, "missing")).toBeUndefined();
  });
});

it("builds obsidian:// URLs", () => {
  expect(obsidianUrl("obsidian", "Daily Updates/2026-11-15.md")).toBe(
    "obsidian://open?vault=obsidian&file=Daily%20Updates%2F2026-11-15",
  );
});
