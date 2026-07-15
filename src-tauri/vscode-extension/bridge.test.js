const { describe, expect, it } = require("bun:test");
const { handleBridgeRequest, parseBridgeRequest } = require("./bridge");

function fakeVscode() {
  const calls = [];
  return {
    calls,
    api: {
      commands: {
        executeCommand: async (command, argument) => {
          calls.push([command, argument]);
        },
      },
      Position: class Position {
        constructor(line, column) {
          this.line = line;
          this.column = column;
        }
      },
      Range: class Range {
        constructor(start, end) {
          this.start = start;
          this.end = end;
        }
      },
      Uri: { file: (filePath) => ({ filePath }) },
      workspace: {
        openTextDocument: async (uri) => ({ uri }),
      },
      window: {
        showTextDocument: async (document, options) => {
          calls.push(["showTextDocument", { document, options }]);
        },
      },
    },
  };
}

describe("handleBridgeRequest", () => {
  it("refreshes Git before opening a diff", async () => {
    const vscode = fakeVscode();

    await handleBridgeRequest(vscode.api, { type: "openDiff", filePath: "/project/src/a.ts" });

    expect(vscode.calls).toEqual([
      ["workbench.view.scm", undefined],
      ["git.refresh", undefined],
      ["git.openChange", { filePath: "/project/src/a.ts" }],
    ]);
  });

  it("opens a file at its one-based terminal location", async () => {
    const vscode = fakeVscode();

    await handleBridgeRequest(vscode.api, {
      type: "openFile",
      filePath: "/project/src/a.ts",
      line: 31,
      column: 7,
    });

    expect(vscode.calls).toEqual([
      [
        "showTextDocument",
        {
          document: { uri: { filePath: "/project/src/a.ts" } },
          options: {
            preview: false,
            selection: {
              start: { line: 30, column: 6 },
              end: { line: 30, column: 6 },
            },
          },
        },
      ],
    ]);
  });

  it("parses the Rust bridge payload", () => {
    expect(
      parseBridgeRequest('{"type":"openFile","filePath":"/project/src/a.ts","line":31,"column":7}'),
    ).toEqual({ type: "openFile", filePath: "/project/src/a.ts", line: 31, column: 7 });
  });
});
