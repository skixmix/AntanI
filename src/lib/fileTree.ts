import type { FileChangeKind, GitFileEntry } from "./types";

interface TreeFileNode {
  type: "file";
  name: string;
  path: string;
  kind: FileChangeKind;
}

export interface TreeFolderNode {
  type: "folder";
  name: string;
  path: string;
  children: TreeNode[];
}

export type TreeNode = TreeFileNode | TreeFolderNode;

function sortTree(nodes: TreeNode[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    if (node.type === "folder") sortTree(node.children);
  }
}

/** Turn a flat list of changed-file paths into a nested folder tree, folders
 *  sorted before files, both alphabetically. */
export function buildFileTree(entries: GitFileEntry[]): TreeNode[] {
  const root: TreeFolderNode = { type: "folder", name: "", path: "", children: [] };

  for (const entry of entries) {
    const segments = entry.path.split("/").filter(Boolean);
    if (segments.length === 0) continue;

    let cursor = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      const path = cursor.path ? `${cursor.path}/${segment}` : segment;
      let next = cursor.children.find(
        (c): c is TreeFolderNode => c.type === "folder" && c.name === segment,
      );
      if (!next) {
        next = { type: "folder", name: segment, path, children: [] };
        cursor.children.push(next);
      }
      cursor = next;
    }

    const name = segments[segments.length - 1];
    cursor.children.push({ type: "file", name, path: entry.path, kind: entry.kind });
  }

  sortTree(root.children);
  return root.children;
}
