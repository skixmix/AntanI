import type { AgentKind, TabStatus } from "./tabs";

type PromptSignature = readonly RegExp[];

const PROVIDER_PROMPT_SIGNATURES: Record<AgentKind, readonly PromptSignature[]> = {
  claude: [
    [/Do you want to proceed\?/i, /(?:Tab to amend|ctrl\+e to explain)/i],
    [/Do you want to make this edit to/i, /Tab to amend/i],
    [/Allow Claude to/i, /(?:Yes, and (?:don't ask again|always allow)|Esc to cancel)/i],
    [/Chat about this/i, /Enter to select/i, /to navigate/i],
    [
      /Network request outside of sandbox/i,
      /Do you want to allow this connection\?/i,
      /No, and tell Claude what to do differently/i,
    ],
    [/Claude has written up a plan/i, /Yes, and use auto mode/i],
  ],
  opencode: [
    [/Permission required/i, /Allow once/i, /Allow always/i, /Reject/i],
    [/Type your own answer/i, /enter submit/i, /esc dismiss/i],
    [/select all that apply/i, /enter (?:submit|toggle)/i, /esc dismiss/i],
  ],
  codex: [
    [
      /Would you like to (?:run|make|grant)/i,
      /Yes, (?:just this once|proceed)/i,
      /(?:Press enter to confirm|No, and tell Codex what to do differently)/i,
    ],
    [
      /Question \d+\/\d+ \(\d+ unanswered\)/i,
      /enter to submit answer/i,
      /(?:tab to add notes|esc to interrupt)/i,
    ],
    [/navigate questions/i, /(?:Type your answer \(optional\)|Select an option to add notes)/i],
  ],
};

const PROVIDER_BUSY_SIGNATURES: Record<AgentKind, readonly PromptSignature[]> = {
  claude: [[/esc to interrupt/i, /ctrl\+t to (?:show|hide) todos/i]],
  opencode: [[/esc\s+(?:again\s+to\s+)?interrupt/i]],
  codex: [],
};

export function settledAgentStatus(kind: AgentKind, screenText: string): TabStatus {
  const isPrompt = PROVIDER_PROMPT_SIGNATURES[kind].some((signature) =>
    signature.every((pattern) => pattern.test(screenText)),
  );
  if (isPrompt) return "waiting";
  const isBusy = PROVIDER_BUSY_SIGNATURES[kind].some((signature) =>
    signature.every((pattern) => pattern.test(screenText)),
  );
  return isBusy ? "busy" : "ready";
}
