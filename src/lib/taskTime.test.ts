import { describe, expect, it } from "vitest";
import {
  columnAgeLevel,
  daysBetween,
  formatDuration,
  formatTimestamp,
  taskDurationMs,
} from "./taskTime";

describe("taskDurationMs", () => {
  it("returns null when the task never started or is not done", () => {
    expect(taskDurationMs(null, 100)).toBeNull();
    expect(taskDurationMs(100, null)).toBeNull();
  });
  it("returns the elapsed milliseconds", () => {
    expect(taskDurationMs(1000, 4000)).toBe(3000);
  });
});

describe("formatDuration", () => {
  it("renders a dash for missing, negative or non-finite input", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(-5)).toBe("—");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("—");
  });
  it("renders seconds, minutes, hours and days", () => {
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(5 * 60_000)).toBe("5m");
    expect(formatDuration(2 * 3_600_000)).toBe("2h");
    expect(formatDuration(2 * 3_600_000 + 5 * 60_000)).toBe("2h 5m");
    expect(formatDuration(26 * 3_600_000)).toBe("1d 2h");
    expect(formatDuration(48 * 3_600_000)).toBe("2d");
  });
});

describe("formatTimestamp", () => {
  it("renders a dash for missing or non-finite input", () => {
    expect(formatTimestamp(null)).toBe("—");
    expect(formatTimestamp(Number.POSITIVE_INFINITY)).toBe("—");
  });
  it("renders a non-empty string for a valid timestamp", () => {
    const rendered = formatTimestamp(Date.UTC(2026, 0, 15, 10, 30));
    expect(rendered).not.toBe("—");
    expect(rendered.length).toBeGreaterThan(0);
  });
});

describe("daysBetween", () => {
  it("floors elapsed whole days and never goes negative", () => {
    const day = 86_400_000;
    expect(daysBetween(0, 0)).toBe(0);
    expect(daysBetween(0, day * 3 + 5000)).toBe(3);
    expect(daysBetween(day * 5, 0)).toBe(0);
  });
});

describe("columnAgeLevel", () => {
  it("escalates fresh → aging → stale by day thresholds", () => {
    expect(columnAgeLevel(0)).toBe("fresh");
    expect(columnAgeLevel(2)).toBe("fresh");
    expect(columnAgeLevel(3)).toBe("aging");
    expect(columnAgeLevel(6)).toBe("aging");
    expect(columnAgeLevel(7)).toBe("stale");
    expect(columnAgeLevel(30)).toBe("stale");
  });
});
