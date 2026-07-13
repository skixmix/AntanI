import { writePty } from "../lib/api.ipc";
import { encodeInjection } from "../lib/inject";
import type { Tab } from "../lib/tabs";
import type { Injectable, InjectTarget, Project } from "../lib/types";
import { CustomCommandIcon, WrenchIcon } from "./Icons";
import type { CommandsSubTab } from "./SettingsPage";

interface InjectBarProps {
  project: Project;
  activeTab: Tab;
  onOpenCommandSettings: (subTab?: CommandsSubTab) => void;
}

/** Bottom bar shown only on terminal/AI tabs. Each chip writes its snippet into
 *  the current tab's PTY without submitting, then refocuses the terminal. */
export function InjectBar({ project, activeTab, onOpenCommandSettings }: InjectBarProps) {
  const wanted: InjectTarget =
    activeTab.kind === "claude" || activeTab.kind === "opencode" ? "ai" : "terminal";
  const injectables = project.injectables.filter((i) => i.target === wanted);
  const settingsSubTab: CommandsSubTab = wanted === "ai" ? "prompts" : "snippets";

  function inject(inj: Injectable) {
    void writePty(activeTab.id, encodeInjection(inj.text, activeTab.kind));
    window.dispatchEvent(new CustomEvent("antani:focus-terminal", { detail: activeTab.id }));
  }

  return (
    <div
      className="flex items-stretch text-xs shrink-0"
      style={{ height: 34, borderTop: "1px solid var(--color-border)" }}
    >
      <button
        type="button"
        title="Manage snippets"
        onClick={() => onOpenCommandSettings(settingsSubTab)}
        className="flex shrink-0 items-center px-3 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        style={{ borderRight: "1px solid var(--color-border)" }}
      >
        <WrenchIcon size={13} />
      </button>

      <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hidden px-1.5">
        {injectables.length === 0 ? (
          <span className="px-1.5 text-muted-foreground">
            {wanted === "ai" ? "No prompts yet" : "No snippets yet"}
          </span>
        ) : (
          injectables.map((inj) => (
            <button
              key={inj.id}
              type="button"
              title={inj.text}
              onClick={() => inject(inj)}
              className="flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <span style={{ color: inj.color }}>
                <CustomCommandIcon size={13} />
              </span>
              <span>{inj.name}</span>
            </button>
          ))
        )}

        <button
          type="button"
          title={wanted === "ai" ? "Add prompt" : "Add snippet"}
          onClick={() => onOpenCommandSettings(settingsSubTab)}
          className="flex shrink-0 items-center justify-center rounded px-2 py-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          +
        </button>
      </div>
    </div>
  );
}
