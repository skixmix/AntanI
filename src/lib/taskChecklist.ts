export interface ChecklistItem {
  /** Zero-based index of the source line the item lives on. */
  line: number;
  text: string;
  checked: boolean;
}

const CHECKBOX_RE = /^(\s*[-*+]\s+)\[([ xX])\](.*)$/;
const FENCE_RE = /^\s*(```|~~~)/;

/** Walk non-fenced lines only, so item indices match the checkboxes the
 *  renderer produces (a `- [ ]` inside a code block is literal text, not a task). */
function eachContentLine(markdown: string, fn: (raw: string, line: number) => void): void {
  let inFence = false;
  markdown.split("\n").forEach((raw, line) => {
    if (FENCE_RE.test(raw)) {
      inFence = !inFence;
      return;
    }
    if (!inFence) fn(raw, line);
  });
}

export function parseChecklist(markdown: string): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  eachContentLine(markdown, (raw, line) => {
    const m = CHECKBOX_RE.exec(raw);
    if (m) items.push({ line, text: m[3].trim(), checked: m[2] !== " " });
  });
  return items;
}

export function checklistProgress(markdown: string): { done: number; total: number } {
  const items = parseChecklist(markdown);
  return { total: items.length, done: items.filter((i) => i.checked).length };
}

/** Flip the checkbox of the `index`-th task-list item (document order) and
 *  return the updated markdown, preserving that line's indentation and text.
 *  Out-of-range indexes return the input unchanged. */
export function toggleChecklistItem(markdown: string, index: number): string {
  const items = parseChecklist(markdown);
  const item = items[index];
  if (!item) return markdown;
  const lines = markdown.split("\n");
  const raw = lines[item.line];
  const m = CHECKBOX_RE.exec(raw);
  if (!m) return markdown;
  const start = m[1].length;
  const next = item.checked ? " " : "x";
  lines[item.line] = `${raw.slice(0, start)}[${next}]${raw.slice(start + 3)}`;
  return lines.join("\n");
}

/** The notes with task-list lines removed, for a prose-only card preview. */
export function stripChecklist(markdown: string): string {
  let inFence = false;
  return markdown
    .split("\n")
    .filter((raw) => {
      if (FENCE_RE.test(raw)) {
        inFence = !inFence;
        return true;
      }
      return inFence || !CHECKBOX_RE.test(raw);
    })
    .join("\n")
    .trim();
}
