import { describe, expect, it } from "vitest";
import { encodeInjection } from "./inject";

describe("encodeInjection", () => {
  it("leaves single-line text untouched", () => {
    expect(encodeInjection("bun test", "terminal")).toBe("bun test");
    expect(encodeInjection("explain this", "claude")).toBe("explain this");
  });

  it("translates newlines to the shell soft-newline for terminal tabs", () => {
    expect(encodeInjection("a\nb", "terminal")).toBe("a\x16\nb");
  });

  it("translates newlines to the CSI-u soft-newline for AI tabs", () => {
    expect(encodeInjection("a\nb", "claude")).toBe("a\x1b[13;2ub");
    expect(encodeInjection("a\nb", "opencode")).toBe("a\x1b[13;2ub");
  });

  it("normalizes CRLF and CR to the same soft-newline", () => {
    expect(encodeInjection("a\r\nb\rc", "terminal")).toBe("a\x16\nb\x16\nc");
  });

  it("never appends a trailing newline (nothing is submitted)", () => {
    expect(encodeInjection("run", "claude").endsWith("\x1b[13;2u")).toBe(false);
    expect(encodeInjection("run", "terminal").endsWith("\n")).toBe(false);
  });
});
