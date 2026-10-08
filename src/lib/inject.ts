import { isAgentKind, type TabKind } from "./tabs";

const AGENT_INSERT_NEWLINE = "\n";
const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";

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
 *  whole block lands as one unsent draft the user reviews, then sends.
 *  Agent TUIs all enable bracketed paste; without the markers Claude Code
 *  guesses paste boundaries from read chunks and keeps only a fragment. */
export function encodeInjection(text: string, kind: TabKind): string {
  const encoded = text.replace(/\r\n|\r|\n/g, softNewlineForKind(kind));
  if (!isAgentKind(kind)) return encoded;
  return BRACKETED_PASTE_START + encoded + BRACKETED_PASTE_END;
}
