import { describe, expect, it } from "vitest";
import {
  checklistProgress,
  parseChecklist,
  stripChecklist,
  toggleChecklistItem,
} from "./taskChecklist";

const md = `# Notes

Some prose here.

- [ ] first
- [x] second
  - [ ] nested third
* [X] fourth

More prose.`;

describe("parseChecklist", () => {
  it("finds task-list items with state, ignoring prose and plain bullets", () => {
    const items = parseChecklist(md);
    expect(items.map((i) => i.text)).toEqual(["first", "second", "nested third", "fourth"]);
    expect(items.map((i) => i.checked)).toEqual([false, true, false, true]);
  });

  it("returns nothing for markdown without task items", () => {
    expect(parseChecklist("just text\n- a plain bullet")).toEqual([]);
  });

  it("ignores checkbox syntax inside fenced code blocks", () => {
    const withFence = "- [ ] real\n\n```\n- [ ] not a task\n```\n\n- [x] also real";
    const items = parseChecklist(withFence);
    expect(items.map((i) => i.text)).toEqual(["real", "also real"]);
    expect(items.map((i) => i.checked)).toEqual([false, true]);
  });
});

describe("checklistProgress", () => {
  it("counts done and total", () => {
    expect(checklistProgress(md)).toEqual({ done: 2, total: 4 });
  });
});

describe("toggleChecklistItem", () => {
  it("flips an unchecked item to checked", () => {
    expect(parseChecklist(toggleChecklistItem(md, 0))[0].checked).toBe(true);
  });

  it("flips a nested item, preserving indentation and text", () => {
    const out = toggleChecklistItem(md, 2);
    expect(out).toContain("  - [x] nested third");
  });

  it("leaves the other items untouched", () => {
    const items = parseChecklist(toggleChecklistItem(md, 0));
    expect(items[1].checked).toBe(true);
    expect(items[3].checked).toBe(true);
  });

  it("returns the input unchanged for an out-of-range index", () => {
    expect(toggleChecklistItem(md, 99)).toBe(md);
  });
});

describe("stripChecklist", () => {
  it("removes task-list lines and keeps the prose", () => {
    const out = stripChecklist(md);
    expect(out).toContain("Some prose here.");
    expect(out).toContain("More prose.");
    expect(out).not.toContain("first");
    expect(out).not.toContain("nested third");
  });
});
