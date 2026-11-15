import { describe, expect, it } from "vitest";
import { addDaysKey, dateFromOffset, dayKey, isDayKey, offsetOf, relativeLabel } from "./dates";

describe("dates", () => {
  const now = new Date(2026, 10, 15, 23, 30); // 15 Nov 2026, 23:30 local

  it("formats local date keys", () => {
    expect(dayKey(now)).toBe("2026-11-15");
    expect(dayKey(dateFromOffset(-1, now))).toBe("2026-11-14");
    expect(dayKey(dateFromOffset(17, now))).toBe("2026-12-02");
  });

  it("computes offsets from today", () => {
    expect(offsetOf("2026-11-15", now)).toBe(0);
    expect(offsetOf("2026-11-14", now)).toBe(-1);
    expect(offsetOf("2026-12-15", now)).toBe(30);
  });

  it("labels relative days", () => {
    expect(relativeLabel(0)).toBe("TODAY");
    expect(relativeLabel(-1)).toBe("YESTERDAY");
    expect(relativeLabel(-3)).toBe("3 DAYS AGO");
    expect(relativeLabel(2)).toBe("IN 2 DAYS");
  });

  it("adds days across month boundaries", () => {
    expect(addDaysKey("2026-11-28", 7)).toBe("2026-12-05");
    expect(addDaysKey("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("recognises day keys", () => {
    expect(isDayKey("2026-11-15")).toBe(true);
    expect(isDayKey("Quick Notes")).toBe(false);
  });
});
