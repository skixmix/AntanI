import type { AgentKind, TabStatus } from "./tabs";

type PromptSignature = readonly RegExp[];

const PROVIDER_PROMPT_SIGNATURES: Record<AgentKind, readonly PromptSignature[]> = {
  claude: [
    [/Do you want to proceed\?/i, /(?:Tab to amend|ctrl\+e to explain)/i],
    [/Allow Claude to/i, /(?:Yes, and (?:don't ask again|always allow)|Esc to cancel)/i],
    [/Chat about this/i, /Enter to select/i, /to navigate/i],
    [
      /Network request outside of sandbox/i,
      /Do you want to allow this connection\?/i,
      /No, and tell Claude what to do differently/i,
    ],
  ],
  opencode: [
    [/Permission required/i, /Allow once/i, /Allow always/i, /enter confirm/i],
    [/Type your own answer/i, /enter submit/i, /esc dismiss/i],
    [/select all that apply/i, /enter submit/i],
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

export function settledAgentStatus(kind: AgentKind, screenText: string): TabStatus {
  const isPrompt = PROVIDER_PROMPT_SIGNATURES[kind].some((signature) =>
    signature.every((pattern) => pattern.test(screenText)),
  );
  return isPrompt ? "waiting" : "ready";
}
