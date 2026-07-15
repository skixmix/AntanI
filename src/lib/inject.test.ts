import { describe, expect, it } from "vitest";
import { encodeInjection, softNewlineForKind } from "./inject";

describe("encodeInjection", () => {
  it("leaves single-line text untouched", () => {
    expect(encodeInjection("bun test", "terminal")).toBe("bun test");
    expect(encodeInjection("explain this", "claude")).toBe("explain this");
  });

  it("translates newlines to the shell soft-newline for terminal tabs", () => {
    expect(encodeInjection("a\nb", "terminal")).toBe("a\x16\nb");
  });

  it.each(["claude", "opencode", "codex"] as const)("uses Ctrl-J soft-newlines for %s", (kind) => {
    expect(encodeInjection("a\nb", kind)).toBe("a\nb");
  });

  it("normalizes CRLF and CR to the same soft-newline", () => {
    expect(encodeInjection("a\r\nb\rc", "codex")).toBe("a\nb\nc");
    expect(encodeInjection("a\r\nb\rc", "terminal")).toBe("a\x16\nb\x16\nc");
  });

  it("never appends a trailing newline (nothing is submitted)", () => {
    expect(encodeInjection("run", "claude").endsWith("\n")).toBe(false);
    expect(encodeInjection("run", "terminal").endsWith("\n")).toBe(false);
  });
});

describe("softNewlineForKind", () => {
  it("selects the agent or shell key sequence", () => {
    expect(softNewlineForKind("claude")).toBe("\n");
    expect(softNewlineForKind("opencode")).toBe("\n");
    expect(softNewlineForKind("codex")).toBe("\n");
    expect(softNewlineForKind("terminal")).toBe("\x16\n");
  });
});
