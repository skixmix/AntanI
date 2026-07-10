import { describe, expect, it } from "vitest";
import { basename, defaultColorForIndex, PROJECT_COLORS } from "./constants";

describe("basename", () => {
  it("returns the final path segment", () => {
    expect(basename("/Users/foo/my-project")).toBe("my-project");
  });

  it("ignores trailing slashes", () => {
    expect(basename("/Users/foo/my-project/")).toBe("my-project");
    expect(basename("/Users/foo/my-project///")).toBe("my-project");
  });

  it("handles a bare folder name with no separators", () => {
    expect(basename("my-project")).toBe("my-project");
  });

  it("handles Windows-style separators", () => {
    expect(basename("C:\\Users\\foo\\my-project")).toBe("my-project");
  });

  it("falls back to 'Untitled' for empty or root-only paths", () => {
    expect(basename("")).toBe("Untitled");
    expect(basename("/")).toBe("Untitled");
  });
});

describe("defaultColorForIndex", () => {
  it("maps the first indices to the palette in order", () => {
    expect(defaultColorForIndex(0)).toBe(PROJECT_COLORS[0]);
    expect(defaultColorForIndex(3)).toBe(PROJECT_COLORS[3]);
  });

  it("wraps around when the index exceeds the palette length", () => {
    expect(defaultColorForIndex(PROJECT_COLORS.length)).toBe(PROJECT_COLORS[0]);
    expect(defaultColorForIndex(PROJECT_COLORS.length + 2)).toBe(PROJECT_COLORS[2]);
  });

  it("always returns a color from the palette", () => {
    for (let i = 0; i < 25; i++) {
      expect(PROJECT_COLORS).toContain(defaultColorForIndex(i));
    }
  });
});
