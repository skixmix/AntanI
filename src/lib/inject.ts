import { isAgentKind, type TabKind } from "./tabs";

const AGENT_INSERT_NEWLINE = "\n";

/** Soft-newline for a plain shell: Ctrl-V (readline quoted-insert) + Ctrl-J
 *  (line feed) inserts a literal newline into the line buffer instead of
 *  submitting. Must be Ctrl-J, not a bare \r, which readline would submit. */
const SHELL_SOFT_NEWLINE = "\x16\n";

export function softNewlineForKind(kind: TabKind): string {
  if (isAgentKind(kind)) return AGENT_INSERT_NEWLINE;
  return SHELL_SOFT_NEWLINE;
}

/** Encode injectable text for writing straight into a tab's PTY without
 *  submitting it: every embedded newline becomes the tab's soft-newline so the
 *  whole block lands as one unsent draft the user reviews, then sends. */
export function encodeInjection(text: string, kind: TabKind): string {
  return text.replace(/\r\n|\r|\n/g, softNewlineForKind(kind));
}
