import { describe, it, expect } from "vitest";
import { daysBetween, lastNDayStrings, toDateString } from "./dates";

describe("toDateString", () => {
  it("formats a Date as YYYY-MM-DD", () => {
    expect(toDateString(new Date("2026-03-05T15:30:00Z"))).toBe("2026-03-05");
  });
});

describe("lastNDayStrings", () => {
  it("returns n days ending on the given date, oldest first", () => {
    const days = lastNDayStrings(7, new Date("2026-03-10T00:00:00Z"));
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-03-04");
    expect(days[6]).toBe("2026-03-10");
  });

  it("returns a single day for n=1", () => {
    expect(lastNDayStrings(1, new Date("2026-03-10T00:00:00Z"))).toEqual(["2026-03-10"]);
  });
});

describe("daysBetween", () => {
  it("computes whole days between two date strings", () => {
    expect(daysBetween("2026-03-01", "2026-03-15")).toBe(14);
  });

  it("returns 0 for the same date", () => {
    expect(daysBetween("2026-03-01", "2026-03-01")).toBe(0);
  });

  it("returns a negative number when end is before start", () => {
    expect(daysBetween("2026-03-15", "2026-03-01")).toBe(-14);
  });
});
