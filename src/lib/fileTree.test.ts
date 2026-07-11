import { describe, expect, it } from "vitest";
import { buildFileTree, type TreeFolderNode } from "./fileTree";
import type { GitFileEntry } from "./types";

function entry(path: string, kind: GitFileEntry["kind"] = "modified"): GitFileEntry {
  return { path, kind };
}

describe("buildFileTree", () => {
  it("puts a root-level file directly in the tree", () => {
    const tree = buildFileTree([entry("README.md")]);
    expect(tree).toEqual([
      { type: "file", name: "README.md", path: "README.md", kind: "modified" },
    ]);
  });

  it("nests a deep path into folder nodes", () => {
    const tree = buildFileTree([entry("src/components/App.tsx", "added")]);
    expect(tree).toHaveLength(1);
    const src = tree[0] as TreeFolderNode;
    expect(src).toMatchObject({ type: "folder", name: "src", path: "src" });
    const components = src.children[0] as TreeFolderNode;
    expect(components).toMatchObject({
      type: "folder",
      name: "components",
      path: "src/components",
    });
    expect(components.children).toEqual([
      { type: "file", name: "App.tsx", path: "src/components/App.tsx", kind: "added" },
    ]);
  });

  it("shares a folder node between two files in the same directory", () => {
    const tree = buildFileTree([entry("src/a.ts"), entry("src/b.ts", "deleted")]);
    expect(tree).toHaveLength(1);
    const src = tree[0] as TreeFolderNode;
    expect(src.children).toHaveLength(2);
  });

  it("sorts folders before files, both alphabetically", () => {
    const tree = buildFileTree([
      entry("z.ts"),
      entry("a.ts"),
      entry("mid/file.ts"),
      entry("aaa/file.ts"),
    ]);
    expect(tree.map((n) => n.name)).toEqual(["aaa", "mid", "a.ts", "z.ts"]);
  });

  it("returns an empty array for no entries", () => {
    expect(buildFileTree([])).toEqual([]);
  });
});
