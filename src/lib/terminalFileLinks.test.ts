import { describe, expect, it } from "vitest";
import { findTerminalFileReferences } from "./terminalFileLinks";

describe("findTerminalFileReferences", () => {
  it("parses project-relative files with line and column", () => {
    const text = "Check `src/components/TerminalView.tsx:86:12` next";

    expect(findTerminalFileReferences(text)).toEqual([
      {
        text: "src/components/TerminalView.tsx:86:12",
        path: "src/components/TerminalView.tsx",
        line: 86,
        column: 12,
        startIndex: 7,
      },
    ]);
  });

  it("parses bare filenames and defaults to the first position", () => {
    expect(findTerminalFileReferences("See file_name.ts for details")).toEqual([
      {
        text: "file_name.ts",
        path: "file_name.ts",
        line: 1,
        column: 1,
        startIndex: 4,
      },
    ]);
  });

  it("decodes file URLs with VS Code line fragments", () => {
    const text = "file:///Users/foo/My%20Project/src/main.ts#L31,7";

    expect(findTerminalFileReferences(text)).toEqual([
      {
        text,
        path: "/Users/foo/My Project/src/main.ts",
        line: 31,
        column: 7,
        startIndex: 0,
      },
    ]);
  });

  it("parses file URLs with colon locations", () => {
    expect(findTerminalFileReferences("file:///Users/foo/project/src/main.ts:12:4")).toEqual([
      {
        text: "file:///Users/foo/project/src/main.ts:12:4",
        path: "/Users/foo/project/src/main.ts",
        line: 12,
        column: 4,
        startIndex: 0,
      },
    ]);
  });

  it("ignores malformed encoded file URLs", () => {
    expect(findTerminalFileReferences("file:///Users/foo/My%ZZProject/src/main.ts#L2")).toEqual([]);
  });

  it("finds multiple references without treating prose as a file", () => {
    const text = "Compare src/a.ts:2 and ./tests/a.test.ts:9.";

    expect(findTerminalFileReferences(text).map(({ path, line }) => ({ path, line }))).toEqual([
      { path: "src/a.ts", line: 2 },
      { path: "./tests/a.test.ts", line: 9 },
    ]);
  });
});
