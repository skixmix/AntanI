import { describe, expect, it } from "vitest";
import { isNewerVersion } from "./updateCheck";

describe("isNewerVersion", () => {
  it("detects a newer patch, minor, and major version", () => {
    expect(isNewerVersion("0.9.0", "0.9.1")).toBe(true);
    expect(isNewerVersion("0.9.0", "0.10.0")).toBe(true);
    expect(isNewerVersion("0.9.0", "1.0.0")).toBe(true);
  });

  it("returns false for equal or older versions", () => {
    expect(isNewerVersion("0.9.0", "0.9.0")).toBe(false);
    expect(isNewerVersion("0.9.0", "0.8.9")).toBe(false);
  });

  it("tolerates a leading v and missing trailing parts", () => {
    expect(isNewerVersion("0.9.0", "v0.9.1")).toBe(true);
    expect(isNewerVersion("0.9.0", "0.10")).toBe(true);
    expect(isNewerVersion("0.9", "0.9.0")).toBe(false);
  });
});
