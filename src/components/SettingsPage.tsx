import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Settings } from "../lib/types";
import { TerminalIcon, VSCodeIcon } from "./Icons";

interface SettingsPageProps {
  settings: Settings;
  onClose: () => void;
  onImportVscode: () => void;
  onUpdateSettings: (patch: Partial<Settings>) => void;
}

type TabId = "general" | "commands" | "vscode";

const TABS: { id: TabId; label: string; icon: (className: string) => ReactNode }[] = [
  {
    id: "general",
    label: "General",
    icon: (className) => (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        className={className}
      >
        <path
          d="M8 1.8c-.4 0-.7.3-.8.6L6.9 3.6a4.8 4.8 0 0 0-1.2.5l-1.2-.6a.8.8 0 0 0-1 .2l-.7.7a.8.8 0 0 0-.2 1l.6 1.2c-.2.4-.4.8-.5 1.2l-1.2.3a.8.8 0 0 0-.6.8v1c0 .4.3.7.6.8l1.2.3c.1.4.3.8.5 1.2l-.6 1.2a.8.8 0 0 0 .2 1l.7.7c.3.3.7.3 1 .2l1.2-.6c.4.2.8.4 1.2.5l.3 1.2c.1.3.4.6.8.6h1c.4 0 .7-.3.8-.6l.3-1.2c.4-.1.8-.3 1.2-.5l1.2.6a.8.8 0 0 0 1-.2l.7-.7a.8.8 0 0 0 .2-1l-.6-1.2c.2-.4.4-.8.5-1.2l1.2-.3c.3-.1.6-.4.6-.8v-1a.8.8 0 0 0-.6-.8l-1.2-.3a4.8 4.8 0 0 0-.5-1.2l.6-1.2a.8.8 0 0 0-.2-1l-.7-.7a.8.8 0 0 0-1-.2l-1.2.6a4.8 4.8 0 0 0-1.2-.5l-.3-1.2a.8.8 0 0 0-.8-.6h-1Z"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="8" r="1.9" stroke="currentColor" strokeWidth="1.1" />
      </svg>
    ),
  },
  {
    id: "commands",
    label: "Commands",
    icon: (className) => <TerminalIcon size={14} className={className} />,
  },
  {
    id: "vscode",
    label: "VS Code",
    icon: (className) => <VSCodeIcon size={14} className={className} />,
  },
];

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function CommandField({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  function commit() {
    const trimmed = draft.trim();
    setDraft(trimmed || placeholder);
    if (trimmed && trimmed !== value) onCommit(trimmed);
    else if (!trimmed && value !== placeholder) onCommit(placeholder);
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(value);
        }}
        spellCheck={false}
        className="w-full rounded-md bg-tertiary px-2.5 py-1.5 font-mono text-xs text-foreground outline-none ring-1 ring-border transition-shadow focus:ring-primary/60"
      />
    </label>
  );
}

export function SettingsPage({
  settings,
  onClose,
  onImportVscode,
  onUpdateSettings,
}: SettingsPageProps) {
  const [tab, setTab] = useState<TabId>("general");

  // Park native webviews while the page is open — same reason as every other
  // full-screen/modal surface: they always paint on top of web content.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("antani:picker-open"));
    return () => {
      window.dispatchEvent(new CustomEvent("antani:picker-close"));
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div
        className="flex h-[53px] shrink-0 items-center justify-between px-5"
        style={{ borderBottom: "1px solid var(--color-panel-divider)" }}
      >
        <h1 className="text-sm font-semibold text-foreground">Settings</h1>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M3 3l10 10M13 3L3 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="flex flex-1 justify-center overflow-y-auto">
        <div className="flex w-full max-w-2xl gap-8 px-6 py-10">
          {/* Vertical tab rail */}
          <nav className="flex w-40 shrink-0 flex-col gap-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  tab === t.id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {t.icon("shrink-0 opacity-80")}
                {t.label}
              </button>
            ))}
          </nav>

          {/* Tab content */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {tab === "general" && (
              <SectionCard
                title="Notifications"
                description="Notify when an agent tab becomes ready or needs input, while it isn't the focused tab."
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-muted-foreground">
                    {settings.notificationsEnabled ? "Enabled" : "Disabled"}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.notificationsEnabled}
                    onClick={() =>
                      onUpdateSettings({ notificationsEnabled: !settings.notificationsEnabled })
                    }
                    className={`relative h-5 w-9 shrink-0 appearance-none rounded-full border-0 p-0 outline-none transition-colors ${
                      settings.notificationsEnabled ? "bg-primary" : "bg-secondary"
                    }`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                        settings.notificationsEnabled ? "translate-x-[18px]" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </SectionCard>
            )}

            {tab === "commands" && (
              <SectionCard
                title="Launch commands"
                description="Override the shell command run when opening a Claude or opencode tab — useful for aliases, wrappers, or extra flags."
              >
                <div className="flex flex-col gap-4">
                  <CommandField
                    label="Claude command"
                    value={settings.claudeCommand}
                    placeholder="claude"
                    onCommit={(claudeCommand) => onUpdateSettings({ claudeCommand })}
                  />
                  <CommandField
                    label="opencode command"
                    value={settings.opencodeCommand}
                    placeholder="opencode"
                    onCommit={(opencodeCommand) => onUpdateSettings({ opencodeCommand })}
                  />
                </div>
              </SectionCard>
            )}

            {tab === "vscode" && (
              <SectionCard
                title="Import from VS Code"
                description="Copy extensions and settings from your desktop VS Code installation into AntanI's own storage. Safe to run again — already-imported extensions won't be duplicated."
              >
                <div>
                  <button
                    type="button"
                    onClick={onImportVscode}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    Import now
                  </button>
                </div>
              </SectionCard>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
