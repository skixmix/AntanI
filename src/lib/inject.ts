import type { TabKind } from "./tabs";

/** Soft-newline for AI CLIs (Claude Code / opencode): the CSI-u extended-key
 *  sequence for Shift+Enter, which they treat as "insert newline" rather than
 *  "submit". Same sequence TerminalView sends for a real Shift+Enter. */
const AI_SOFT_NEWLINE = "\x1b[13;2u";

/** Soft-newline for a plain shell: Ctrl-V (readline quoted-insert) + Ctrl-J
 *  (line feed) inserts a literal newline into the line buffer instead of
 *  submitting. Must be Ctrl-J, not a bare \r, which readline would submit. */
const SHELL_SOFT_NEWLINE = "\x16\n";

/** Encode injectable text for writing straight into a tab's PTY without
 *  submitting it: every embedded newline becomes the tab's soft-newline so the
 *  whole block lands as one unsent draft the user reviews, then sends. */
export function encodeInjection(text: string, kind: TabKind): string {
  const soft = kind === "claude" || kind === "opencode" ? AI_SOFT_NEWLINE : SHELL_SOFT_NEWLINE;
  return text.replace(/\r\n|\r|\n/g, soft);
}
