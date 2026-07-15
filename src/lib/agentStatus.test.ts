import { describe, expect, it } from "vitest";
import { settledAgentStatus } from "./agentStatus";

const CLAUDE_QUESTION = `Perm test
Which harmless permission test should we run?
1. Marker on Desktop
4. Type something.
5. Chat about this
Enter to select · ↑/↓ to navigate · Esc to cancel`;

const CLAUDE_PERMISSION = `Bash command (unsandboxed)
mkdir -p "$HOME/Desktop/antani-agent-ui-test"
Do you want to proceed?
1. Yes
2. Yes, and don't ask again for similar commands in /Users/foo/project
3. No
Esc to cancel · Tab to amend · ctrl+e to explain`;

const CLAUDE_NETWORK_PERMISSION = `Network request outside of sandbox
Host: example.com
Do you want to allow this connection?
1. Yes
2. Yes, and don't ask again for example.com
3. No, and tell Claude what to do differently (esc)`;

const OPENCODE_QUESTION = `Which harmless permission test should we run?
1. Create a marker on Desktop
4. Type your own answer
↑↓ select  enter submit  esc dismiss`;

const OPENCODE_PERMISSION = `Permission required
# Shell command
$ curl -I https://example.com
Allow once  Allow always  Reject
ctrl+f fullscreen  ← select  enter confirm`;

const OPENCODE_COMPACT_PERMISSION = `Permission required
# Shell command
$ printf 'safe test\\n'
Allow once  Allow always  Reject`;

const OPENCODE_MULTISELECT_QUESTION = `Scope of go-ahead  Confirm
What should I do now? (select all that apply)
1. [ ] Post a clarification
2. [ ] Add reactions
3. [ ] Implement the fixes
4. [ ] Hold the rest
5. [ ] Type your own answer
↔ tab  ↑↓ select  enter toggle  esc dismiss`;

const CODEX_QUESTION = `Question 1/1 (1 unanswered)
Which harmless permission test should we run?
1. Create a marker on Desktop
4. None of the above
tab to add notes | enter to submit answer | esc to interrupt`;

const CODEX_PERMISSION = `Would you like to run the following command?
Environment: local
$ curl -I https://example.com
1. Yes, proceed
2. Yes, and don't ask again for commands that start with curl
3. No, and tell Codex what to do differently
Press enter to confirm or esc to cancel`;

describe("settledAgentStatus", () => {
  it.each([
    ["claude", CLAUDE_QUESTION],
    ["claude", CLAUDE_PERMISSION],
    ["claude", CLAUDE_NETWORK_PERMISSION],
    ["opencode", OPENCODE_QUESTION],
    ["opencode", OPENCODE_PERMISSION],
    ["opencode", OPENCODE_COMPACT_PERMISSION],
    ["opencode", OPENCODE_MULTISELECT_QUESTION],
    ["codex", CODEX_QUESTION],
    ["codex", CODEX_PERMISSION],
  ] as const)("recognizes the captured %s interaction screen", (kind, screenText) => {
    expect(settledAgentStatus(kind, screenText)).toBe("waiting");
  });

  it.each([
    ["claude", OPENCODE_PERMISSION],
    ["opencode", CODEX_PERMISSION],
    ["codex", CLAUDE_PERMISSION],
  ] as const)("does not apply another provider's cues to %s", (kind, screenText) => {
    expect(settledAgentStatus(kind, screenText)).toBe("ready");
  });

  it.each([
    ["claude", "The assistant asked: Do you want to proceed?"],
    ["claude", "You can press Tab to amend the command."],
    ["claude", "The assistant asked: Do you want to allow this connection?"],
    ["opencode", "The documentation calls this Permission required."],
    ["opencode", "Choose Allow once if you want to continue."],
    ["opencode", "Reject is one possible decision."],
    ["opencode", "The form says to select all that apply."],
    ["codex", "The prompt says: Would you like to run the following command?"],
    ["codex", "Question 1/1 (1 unanswered) is the heading used in the screenshot."],
  ] as const)("does not treat a lone %s UI phrase in prose as a prompt", (kind, screenText) => {
    expect(settledAgentStatus(kind, screenText)).toBe("ready");
  });

  it.each([
    "claude",
    "opencode",
    "codex",
  ] as const)("does not treat ordinary prose as a prompt for %s", (kind) => {
    expect(
      settledAgentStatus(kind, "I can confirm the trust model. Press enter in the example."),
    ).toBe("ready");
  });

  it("does not treat Claude's generic cancel hint alone as a prompt", () => {
    expect(settledAgentStatus("claude", "Build completed. Esc to cancel was shown earlier.")).toBe(
      "ready",
    );
  });

  it.each([
    "claude",
    "opencode",
    "codex",
  ] as const)("does not treat a generic y/n phrase as a native %s prompt", (kind) => {
    expect(settledAgentStatus(kind, "The example asks whether to continue [y/n].")).toBe("ready");
  });
});
