import { describe, expect, it } from "vitest";
import { encodeInjection, softNewlineForKind } from "./inject";

const paste = (text: string) => `\x1b[200~${text}\x1b[201~`;

describe("encodeInjection", () => {
  it("leaves single-line shell text untouched", () => {
    expect(encodeInjection("bun test", "terminal")).toBe("bun test");
  });

  it.each(["claude", "opencode", "codex"] as const)("bracket-pastes %s text", (kind) => {
    expect(encodeInjection("explain this", kind)).toBe(paste("explain this"));
  });

  it("translates newlines to the shell soft-newline for terminal tabs", () => {
    expect(encodeInjection("a\nb", "terminal")).toBe("a\x16\nb");
  });

  it.each(["claude", "opencode", "codex"] as const)("uses Ctrl-J soft-newlines for %s", (kind) => {
    expect(encodeInjection("a\nb", kind)).toBe(paste("a\nb"));
  });

  it("normalizes CRLF and CR to the same soft-newline", () => {
    expect(encodeInjection("a\r\nb\rc", "codex")).toBe(paste("a\nb\nc"));
    expect(encodeInjection("a\r\nb\rc", "terminal")).toBe("a\x16\nb\x16\nc");
  });

  it("never appends a trailing newline (nothing is submitted)", () => {
    expect(encodeInjection("run", "claude")).not.toContain("\n");
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
